import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { Transaction } from '@transactions/entities/transaction.entity';
import { FxService } from '@fx/fx.service';
import { RedisService } from '@redis/redis.service';
import { DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const buildMockQueryRunner = (overrides = {}): QueryRunner =>
({
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        getRepository: jest.fn(),
        create: jest.fn((_, data) => ({ ...data })),
        save: jest.fn((_, entity) => Promise.resolve(entity)),
        findOne: jest.fn(),
    },
    ...overrides,
} as unknown as QueryRunner);

const mockFxService = { getRate: jest.fn().mockResolvedValue(0.000625) };
const mockRedisService = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
const mockConfigService = { get: jest.fn().mockReturnValue(0.5) };

describe('WalletService', () => {
    let service: WalletService;
    let mockDataSource: DataSource;
    let qr: QueryRunner;

    beforeEach(async () => {
        qr = buildMockQueryRunner();
        mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(qr) } as unknown as DataSource;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WalletService,
                { provide: getRepositoryToken(Wallet), useValue: { findOne: jest.fn() } },
                { provide: getRepositoryToken(WalletBalance), useValue: {} },
                { provide: getRepositoryToken(Transaction), useValue: {} },
                { provide: FxService, useValue: mockFxService },
                { provide: RedisService, useValue: mockRedisService },
                { provide: DataSource, useValue: mockDataSource },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<WalletService>(WalletService);
        jest.clearAllMocks();
        mockDataSource.createQueryRunner = jest.fn().mockReturnValue(qr);
    });

    describe('fundWallet', () => {
        it('adds balance and creates FUNDING transaction', async () => {
            const wallet = { id: 'wallet-uuid', userId: 'user-uuid' };
            const balance = { walletId: 'wallet-uuid', currency: 'NGN', balance: 1000 };

            const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet) };
            const balanceRepo = { findOne: jest.fn().mockResolvedValue(balance) };

            (qr.manager.getRepository as jest.Mock)
                .mockReturnValueOnce(walletRepo)
                .mockReturnValueOnce(balanceRepo);

            await service.fundWallet('user-uuid', { amount: 5000, currency: 'NGN' });

            expect(qr.commitTransaction).toHaveBeenCalled();
            expect(balance.balance).toBe(6000);
        });

        it('creates a new currency balance if one does not exist', async () => {
            const wallet = { id: 'wallet-uuid' };
            const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet) };
            const balanceRepo = { findOne: jest.fn().mockResolvedValue(null) };

            (qr.manager.getRepository as jest.Mock)
                .mockReturnValueOnce(walletRepo)
                .mockReturnValueOnce(balanceRepo);

            await service.fundWallet('user-uuid', { amount: 100, currency: 'USD' });

            expect(qr.commitTransaction).toHaveBeenCalled();
            expect(qr.manager.create).toHaveBeenCalledWith(
                WalletBalance,
                expect.objectContaining({ currency: 'USD', balance: 0 }),
            );
        });

        it('throws NotFoundException when wallet does not exist', async () => {
            const walletRepo = { findOne: jest.fn().mockResolvedValue(null) };
            (qr.manager.getRepository as jest.Mock).mockReturnValue(walletRepo);

            await expect(service.fundWallet('user-uuid', { amount: 100, currency: 'NGN' })).rejects.toThrow(
                NotFoundException,
            );
            expect(qr.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('convertCurrency', () => {
        it('deducts source and credits target currency correctly', async () => {
            mockFxService.getRate.mockResolvedValue(0.000625);
            const wallet = { id: 'wallet-uuid' };
            const ngnBalance = { currency: 'NGN', balance: 10000 };
            const usdBalance = { currency: 'USD', balance: 0 };

            const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet) };
            const balanceRepo = {
                findOne: jest
                    .fn()
                    .mockResolvedValueOnce(ngnBalance)
                    .mockResolvedValueOnce(usdBalance),
            };

            (qr.manager.getRepository as jest.Mock)
                .mockReturnValueOnce(walletRepo)
                .mockReturnValueOnce(balanceRepo)
                .mockReturnValueOnce(balanceRepo);

            await service.convertCurrency('user-uuid', {
                fromCurrency: 'NGN',
                toCurrency: 'USD',
                amount: 1000,
            });

            expect(ngnBalance.balance).toBe(9000);
            expect(usdBalance.balance).toBeCloseTo(0.625, 3);
        });

        it('throws BadRequestException on insufficient balance', async () => {
            mockFxService.getRate.mockResolvedValue(0.000625);
            const wallet = { id: 'wallet-uuid' };
            const ngnBalance = { currency: 'NGN', balance: 100 };

            const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet) };
            const balanceRepo = { findOne: jest.fn().mockResolvedValue(ngnBalance) };

            (qr.manager.getRepository as jest.Mock)
                .mockReturnValueOnce(walletRepo)
                .mockReturnValueOnce(balanceRepo);

            await expect(
                service.convertCurrency('user-uuid', { fromCurrency: 'NGN', toCurrency: 'USD', amount: 50000 }),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws BadRequestException when converting to same currency', async () => {
            await expect(
                service.convertCurrency('user-uuid', { fromCurrency: 'NGN', toCurrency: 'NGN', amount: 100 }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('tradeCurrency', () => {
        it('applies 0.5% fee on top of base conversion cost', async () => {
            mockFxService.getRate.mockResolvedValue(1600);
            const wallet = { id: 'wallet-uuid' };
            const ngnBalance = { currency: 'NGN', balance: 1000000 };
            const usdBalance = { currency: 'USD', balance: 0 };

            const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet) };
            const balanceRepo = {
                findOne: jest.fn().mockResolvedValueOnce(ngnBalance).mockResolvedValueOnce(usdBalance),
            };

            (qr.manager.getRepository as jest.Mock)
                .mockReturnValueOnce(walletRepo)
                .mockReturnValueOnce(balanceRepo)
                .mockReturnValueOnce(balanceRepo);

            const result = await service.tradeCurrency('user-uuid', {
                sourceCurrency: 'NGN',
                targetCurrency: 'USD',
                targetAmount: 100,
            });

            expect(result.received).toBe(100);
            expect(result.fee).toBeGreaterThan(0);
            expect(result.deducted).toBeGreaterThan(100 / 1600);
        });
    });
});