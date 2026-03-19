import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RedisService } from '@redis/redis.service';
import axios from 'axios';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { FxService } from './fx.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockRedisService = { get: jest.fn(), set: jest.fn() };
const mockSnapshotRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((data: Record<string, unknown>) => data),
};
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      FX_API_KEY: 'test_api_key',
      FX_API_BASE_URL: 'https://v6.exchangerate-api.com/v6',
      FX_RATE_TTL_SECONDS: 300,
    };
    return config[key];
  }),
};

describe('FxService', () => {
  let service: FxService;

  beforeEach(async () => {
    mockedAxios.create = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        data: {
          result: 'success',
          base_code: 'NGN',
          conversion_rates: {
            NGN: 1,
            USD: 0.000625,
            EUR: 0.00057,
            GBP: 0.00048,
          },
        },
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxService,
        {
          provide: getRepositoryToken(FxRateSnapshot),
          useValue: mockSnapshotRepo,
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FxService>(FxService);
    jest.clearAllMocks();
  });

  describe('getRates', () => {
    it('returns cached rates from Redis without hitting external API', async () => {
      const cachedData = JSON.stringify({
        base: 'NGN',
        rates: { USD: 0.000625 },
        fetchedAt: new Date().toISOString(),
      });
      mockRedisService.get.mockResolvedValue(cachedData);

      const result = await service.getRates('NGN');

      expect(result.source).toBe('cache');
      expect(result.rates['USD']).toBe(0.000625);
    });

    it('fetches from external API on cache miss and stores in Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSnapshotRepo.create.mockReturnValue({});
      mockSnapshotRepo.save.mockResolvedValue({});

      const result = await service.getRates('NGN');

      expect(result.source).toBe('live');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'fx_rates:NGN',
        expect.any(String),
        300,
      );
      expect(mockSnapshotRepo.save).toHaveBeenCalled();
    });

    it('falls back to DB snapshot when external API fails', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue(new Error('Network Error')),
      };
      (service as unknown as { httpClient: { get: jest.Mock } }).httpClient =
        mockAxiosInstance;

      mockSnapshotRepo.findOne.mockResolvedValue({
        baseCurrency: 'NGN',
        rates: { USD: 0.0006 },
        fetchedAt: new Date(),
      });

      const result = await service.getRates('NGN');
      expect(result.source).toContain('fallback');
    });

    it('throws ServiceUnavailableException when API fails and no DB snapshot exists', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue(new Error('Network Error')),
      };
      (service as unknown as { httpClient: { get: jest.Mock } }).httpClient =
        mockAxiosInstance;
      mockSnapshotRepo.findOne.mockResolvedValue(null);

      await expect(service.getRates('NGN')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getRate', () => {
    it('returns the rate for a specific pair', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ base: 'NGN', rates: { USD: 0.000625 } }),
      );

      const rate = await service.getRate('NGN', 'USD');
      expect(rate).toBe(0.000625);
    });
  });
});
