import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { Transaction } from '@transactions/entities/transaction.entity';
import { FxService } from '@fx/fx.service';
import { RedisService } from '@redis/redis.service';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const makeRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
  save: jest.fn((entity: Record<string, unknown>) => Promise.resolve(entity)),
});

const walletRepoMock = makeRepo();
const balanceRepoMock = makeRepo();
const transactionRepoMock = makeRepo();

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    withRepository: jest.fn((repo: object) => {
      if (repo === walletRepoMock) return walletRepoMock;
      if (repo === balanceRepoMock) return balanceRepoMock;
      if (repo === transactionRepoMock) return transactionRepoMock;
      return makeRepo();
    }),
  },
};

const mockFxService = { getRate: jest.fn().mockResolvedValue(0.000625) };
const mockRedisService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
};
const mockConfigService = { get: jest.fn().mockReturnValue(0.5) };
const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepoMock },
        {
          provide: getRepositoryToken(WalletBalance),
          useValue: balanceRepoMock,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepoMock,
        },
        { provide: FxService, useValue: mockFxService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    jest.clearAllMocks();

    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunner.manager.withRepository.mockImplementation(
      (repo: object) => {
        if (repo === walletRepoMock) return walletRepoMock;
        if (repo === balanceRepoMock) return balanceRepoMock;
        if (repo === transactionRepoMock) return transactionRepoMock;
        return makeRepo();
      },
    );
  });

  describe('fundWallet', () => {
    it('adds balance and creates FUNDING transaction', async () => {
      const wallet = { id: 'wallet-uuid', userId: 'user-uuid' };
      const balance = {
        walletId: 'wallet-uuid',
        currency: 'NGN',
        balance: 1000,
      };

      walletRepoMock.findOne.mockResolvedValue(wallet);
      balanceRepoMock.findOne.mockResolvedValue(balance);
      balanceRepoMock.save.mockResolvedValue(balance);
      transactionRepoMock.create.mockReturnValue({ id: 'tx-uuid' });
      transactionRepoMock.save.mockResolvedValue({ id: 'tx-uuid' });

      await service.fundWallet('user-uuid', { amount: 5000, currency: 'NGN' });

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(balance.balance).toBe(6000);
    });

    it('creates a new currency balance if one does not exist', async () => {
      const wallet = { id: 'wallet-uuid' };

      walletRepoMock.findOne.mockResolvedValue(wallet);
      balanceRepoMock.findOne.mockResolvedValue(null);
      balanceRepoMock.create.mockReturnValue({
        walletId: 'wallet-uuid',
        currency: 'USD',
        balance: 0,
      });
      balanceRepoMock.save.mockResolvedValue({});
      transactionRepoMock.create.mockReturnValue({ id: 'tx-uuid' });
      transactionRepoMock.save.mockResolvedValue({ id: 'tx-uuid' });

      await service.fundWallet('user-uuid', { amount: 100, currency: 'USD' });

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(balanceRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'USD', balance: 0 }),
      );
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      walletRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.fundWallet('user-uuid', { amount: 100, currency: 'NGN' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('convertCurrency', () => {
    it('deducts source and credits target currency correctly', async () => {
      mockFxService.getRate.mockResolvedValue(0.000625);

      const wallet = { id: 'wallet-uuid' };
      const ngnBalance = { currency: 'NGN', balance: 10000 };
      const usdBalance = { currency: 'USD', balance: 0 };

      walletRepoMock.findOne.mockResolvedValue(wallet);
      balanceRepoMock.findOne
        .mockResolvedValueOnce(ngnBalance)
        .mockResolvedValueOnce(usdBalance);
      balanceRepoMock.save.mockResolvedValue({});
      transactionRepoMock.create.mockReturnValue({ id: 'tx-uuid' });
      transactionRepoMock.save.mockResolvedValue({ id: 'tx-uuid' });

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

      walletRepoMock.findOne.mockResolvedValue(wallet);
      balanceRepoMock.findOne.mockResolvedValue(ngnBalance);

      await expect(
        service.convertCurrency('user-uuid', {
          fromCurrency: 'NGN',
          toCurrency: 'USD',
          amount: 50000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when converting to same currency', async () => {
      await expect(
        service.convertCurrency('user-uuid', {
          fromCurrency: 'NGN',
          toCurrency: 'NGN',
          amount: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('tradeCurrency', () => {
    it('applies 0.5% fee on top of base conversion cost', async () => {
      mockFxService.getRate.mockResolvedValue(1600);

      const wallet = { id: 'wallet-uuid' };
      const ngnBalance = { currency: 'NGN', balance: 1000000 };
      const usdBalance = { currency: 'USD', balance: 0 };

      walletRepoMock.findOne.mockResolvedValue(wallet);
      balanceRepoMock.findOne
        .mockResolvedValueOnce(ngnBalance)
        .mockResolvedValueOnce(usdBalance);
      balanceRepoMock.save.mockResolvedValue({});
      transactionRepoMock.create.mockReturnValue({ id: 'tx-uuid' });
      transactionRepoMock.save.mockResolvedValue({ id: 'tx-uuid' });

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
