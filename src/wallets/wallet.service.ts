import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { Transaction } from '@transactions/entities/transaction.entity';
import { TransactionType } from '@transactions/enums/transaction-type.enum';
import { TransactionStatus } from '@transactions/enums/transaction-status.enum';
import { FxService } from '@fx/fx.service';
import { RedisService } from '@redis/redis.service';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import { TradeCurrencyDto } from './dto/trade-currency.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    constructor(
        @InjectRepository(Wallet)
        private readonly walletRepository: Repository<Wallet>,
        @InjectRepository(WalletBalance)
        private readonly balanceRepository: Repository<WalletBalance>,
        private readonly fxService: FxService,
        private readonly redisService: RedisService,
        private readonly dataSource: DataSource,
        private readonly configService: ConfigService,
    ) { }

    async getWallet(userId: string): Promise<{ wallet: Wallet; balances: WalletBalance[] }> {
        const wallet = await this.walletRepository.findOne({
            where: { userId },
            relations: ['balances'],
        });

        if (!wallet) throw new NotFoundException('Wallet not found');

        return { wallet, balances: wallet.balances };
    }

    async fundWallet(
        userId: string,
        dto: FundWalletDto,
    ): Promise<{ transaction: Transaction; newBalance: number }> {
        const currency = dto.currency ?? 'NGN';

        if (dto.idempotencyKey) {
            const cached = await this.checkIdempotency(dto.idempotencyKey);
            if (cached) return cached as { transaction: Transaction; newBalance: number };
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const wallet = await queryRunner.manager
                .getRepository(Wallet)
                .findOne({ where: { userId } });

            if (!wallet) throw new NotFoundException('Wallet not found');

            let balance = await queryRunner.manager
                .getRepository(WalletBalance)
                .findOne({ where: { walletId: wallet.id, currency }, lock: { mode: 'pessimistic_write' } });

            if (!balance) {
                balance = queryRunner.manager.create(WalletBalance, {
                    walletId: wallet.id,
                    currency,
                    balance: 0,
                });
            }

            balance.balance = parseFloat(balance.balance.toString()) + dto.amount;
            await queryRunner.manager.save(WalletBalance, balance);

            const reference = `FUND-${uuidv4()}`;
            const transaction = queryRunner.manager.create(Transaction, {
                userId,
                type: TransactionType.FUNDING,
                fromCurrency: currency,
                amount: dto.amount,
                status: TransactionStatus.SUCCESS,
                reference,
                metadata: { fundingMethod: 'direct', idempotencyKey: dto.idempotencyKey },
            });
            await queryRunner.manager.save(Transaction, transaction);

            await queryRunner.commitTransaction();

            const result = { transaction, newBalance: balance.balance };

            if (dto.idempotencyKey) {
                await this.redisService.set(
                    `idempotency:${dto.idempotencyKey}`,
                    JSON.stringify(result),
                    86400,
                );
            }

            return result;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async convertCurrency(
        userId: string,
        dto: ConvertCurrencyDto,
    ): Promise<{ transaction: Transaction; deducted: number; received: number; rate: number }> {
        if (dto.fromCurrency === dto.toCurrency) {
            throw new BadRequestException('Source and target currencies must be different');
        }

        if (dto.idempotencyKey) {
            const cached = await this.checkIdempotency(dto.idempotencyKey);
            if (cached) return cached as { transaction: Transaction; deducted: number; received: number; rate: number };
        }

        const rate = await this.fxService.getRate(dto.fromCurrency, dto.toCurrency);
        const convertedAmount = parseFloat((dto.amount * rate).toFixed(6));

        return this.executeExchange({
            userId,
            fromCurrency: dto.fromCurrency,
            toCurrency: dto.toCurrency,
            deductAmount: dto.amount,
            creditAmount: convertedAmount,
            rate,
            type: TransactionType.CONVERSION,
            feePercent: 0,
            idempotencyKey: dto.idempotencyKey,
        });
    }

    async tradeCurrency(
        userId: string,
        dto: TradeCurrencyDto,
    ): Promise<{ transaction: Transaction; deducted: number; received: number; rate: number; fee: number }> {
        if (dto.sourceCurrency === dto.targetCurrency) {
            throw new BadRequestException('Source and target currencies must be different');
        }

        if (dto.idempotencyKey) {
            const cached = await this.checkIdempotency(dto.idempotencyKey);
            if (cached) return cached as { transaction: Transaction; deducted: number; received: number; rate: number; fee: number };
        }

        const rate = await this.fxService.getRate(dto.sourceCurrency, dto.targetCurrency);
        const feePercent = this.configService.get<number>('TRADE_FEE_PERCENT', 0.5);

        const rawSourceAmount = dto.targetAmount / rate;
        const feeAmount = parseFloat(((rawSourceAmount * feePercent) / 100).toFixed(6));
        const totalDeduction = parseFloat((rawSourceAmount + feeAmount).toFixed(6));

        const result = await this.executeExchange({
            userId,
            fromCurrency: dto.sourceCurrency,
            toCurrency: dto.targetCurrency,
            deductAmount: totalDeduction,
            creditAmount: dto.targetAmount,
            rate,
            type: TransactionType.TRADE,
            feePercent,
            feeAmount,
            idempotencyKey: dto.idempotencyKey,
        });

        return { ...result, fee: feeAmount };
    }

    private async executeExchange(params: {
        userId: string;
        fromCurrency: string;
        toCurrency: string;
        deductAmount: number;
        creditAmount: number;
        rate: number;
        type: TransactionType;
        feePercent: number;
        feeAmount?: number;
        idempotencyKey?: string;
    }) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const wallet = await queryRunner.manager
                .getRepository(Wallet)
                .findOne({ where: { userId: params.userId } });

            if (!wallet) throw new NotFoundException('Wallet not found');

            const sourceBalance = await queryRunner.manager
                .getRepository(WalletBalance)
                .findOne({
                    where: { walletId: wallet.id, currency: params.fromCurrency },
                    lock: { mode: 'pessimistic_write' },
                });

            if (!sourceBalance || sourceBalance.balance < params.deductAmount) {
                throw new BadRequestException(
                    `Insufficient ${params.fromCurrency} balance. Required: ${params.deductAmount.toFixed(2)}, Available: ${(sourceBalance?.balance ?? 0).toFixed(2)}`,
                );
            }

            sourceBalance.balance = parseFloat(
                (sourceBalance.balance - params.deductAmount).toFixed(6),
            );
            await queryRunner.manager.save(WalletBalance, sourceBalance);

            let targetBalance = await queryRunner.manager
                .getRepository(WalletBalance)
                .findOne({
                    where: { walletId: wallet.id, currency: params.toCurrency },
                    lock: { mode: 'pessimistic_write' },
                });

            if (!targetBalance) {
                targetBalance = queryRunner.manager.create(WalletBalance, {
                    walletId: wallet.id,
                    currency: params.toCurrency,
                    balance: 0,
                });
            }

            targetBalance.balance = parseFloat(
                (parseFloat(targetBalance.balance.toString()) + params.creditAmount).toFixed(6),
            );
            await queryRunner.manager.save(WalletBalance, targetBalance);

            const prefix = params.type === TransactionType.TRADE ? 'TRD' : 'CNV';
            const reference = `${prefix}-${uuidv4()}`;
            const transaction = queryRunner.manager.create(Transaction, {
                userId: params.userId,
                type: params.type,
                fromCurrency: params.fromCurrency,
                toCurrency: params.toCurrency,
                amount: params.deductAmount,
                convertedAmount: params.creditAmount,
                rateUsed: params.rate,
                feePercent: params.feePercent,
                feeAmount: params.feeAmount ?? 0,
                status: TransactionStatus.SUCCESS,
                reference,
                metadata: { idempotencyKey: params.idempotencyKey },
            });

            await queryRunner.manager.save(Transaction, transaction);
            await queryRunner.commitTransaction();

            const result = {
                transaction,
                deducted: params.deductAmount,
                received: params.creditAmount,
                rate: params.rate,
            };

            if (params.idempotencyKey) {
                await this.redisService.set(
                    `idempotency:${params.idempotencyKey}`,
                    JSON.stringify(result),
                    86400,
                );
            }

            return result;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async checkIdempotency(key: string): Promise<unknown | null> {
        const cached = await this.redisService.get(`idempotency:${key}`);
        if (cached) {
            this.logger.warn(`Duplicate request detected for idempotency key: ${key}`);
            return JSON.parse(cached);
        }
        return null;
    }
}