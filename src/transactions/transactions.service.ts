import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

@Injectable()
export class TransactionsService {
    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
    ) { }

    async getUserTransactions(
        userId: string,
        query: QueryTransactionsDto,
    ): Promise<{ transactions: Transaction[]; total: number; page: number; limit: number }> {
        const { page = 1, limit = 20, type, status, currency, startDate, endDate } = query;

        const qb: SelectQueryBuilder<Transaction> = this.transactionRepository
            .createQueryBuilder('tx')
            .where('tx.userId = :userId', { userId })
            .orderBy('tx.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (type) qb.andWhere('tx.type = :type', { type });
        if (status) qb.andWhere('tx.status = :status', { status });
        if (currency) {
            qb.andWhere('(tx.fromCurrency = :currency OR tx.toCurrency = :currency)', { currency });
        }
        if (startDate) qb.andWhere('tx.createdAt >= :startDate', { startDate: new Date(startDate) });
        if (endDate) qb.andWhere('tx.createdAt <= :endDate', { endDate: new Date(endDate) });

        const [transactions, total] = await qb.getManyAndCount();

        return { transactions, total, page, limit };
    }

    async getTransactionByReference(userId: string, reference: string): Promise<Transaction | null> {
        return this.transactionRepository.findOne({ where: { userId, reference } });
    }

    async getAllTransactions(
        query: QueryTransactionsDto,
    ): Promise<{ transactions: Transaction[]; total: number }> {
        const { page = 1, limit = 20, type, status } = query;

        const qb = this.transactionRepository
            .createQueryBuilder('tx')
            .leftJoinAndSelect('tx.user', 'user')
            .orderBy('tx.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (type) qb.andWhere('tx.type = :type', { type });
        if (status) qb.andWhere('tx.status = :status', { status });

        const [transactions, total] = await qb.getManyAndCount();
        return { transactions, total };
    }
}