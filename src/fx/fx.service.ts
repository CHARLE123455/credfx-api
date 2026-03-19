import {
  Injectable,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { RedisService } from '@redis/redis.service';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { SUPPORTED_CURRENCIES } from '@common/constants/currencies';

interface ExchangeRateApiResponse {
  result: string;
  base_code: string;
  conversion_rates: Record<string, number>;
}

interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly httpClient: AxiosInstance;
  private readonly ttl: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(FxRateSnapshot)
    private readonly snapshotRepository: Repository<FxRateSnapshot>,
  ) {
    const apiKey = this.configService.get<string>('FX_API_KEY');
    const baseUrl = this.configService.get<string>('FX_API_BASE_URL');
    this.ttl = this.configService.get<number>('FX_RATE_TTL_SECONDS', 300);

    this.httpClient = axios.create({
      baseURL: `${baseUrl}/${apiKey}`,
      timeout: 8000,
    });
  }

  async getRates(baseCurrency = 'NGN'): Promise<{
    base: string;
    rates: Record<string, number>;
    source: string;
    cachedAt?: string;
  }> {
    const cacheKey = `fx_rates:${baseCurrency}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedRates;
      return { ...parsed, source: 'cache' };
    }

    return this.fetchAndCacheRates(baseCurrency);
  }

  async getRate(from: string, to: string): Promise<number> {
    const ratesData = await this.getRates(from);
    const rate = ratesData.rates[to];

    if (!rate) {
      throw new ServiceUnavailableException(
        `Exchange rate for ${from} → ${to} is currently unavailable`,
      );
    }

    return rate;
  }

  getSupportedPairs(): { pairs: string[]; total: number } {
    const pairs: string[] = [];
    for (const from of SUPPORTED_CURRENCIES) {
      for (const to of SUPPORTED_CURRENCIES) {
        if (from !== to) pairs.push(`${from}/${to}`);
      }
    }
    return { pairs, total: pairs.length };
  }

  private async fetchAndCacheRates(
    baseCurrency: string,
  ): Promise<{ base: string; rates: Record<string, number>; source: string }> {
    try {
      const response = await this.httpClient.get<ExchangeRateApiResponse>(
        `/latest/${baseCurrency}`,
      );

      if (response.data.result !== 'success') {
        throw new Error('FX API returned non-success result');
      }

      const filteredRates = Object.fromEntries(
        SUPPORTED_CURRENCIES.map((currency) => [
          currency,
          response.data.conversion_rates[currency] ?? 0,
        ]),
      );

      const payload = {
        base: baseCurrency,
        rates: filteredRates,
        fetchedAt: new Date().toISOString(),
      };
      const cacheKey = `fx_rates:${baseCurrency}`;
      await this.redisService.set(cacheKey, JSON.stringify(payload), this.ttl);

      await this.snapshotRepository.save(
        this.snapshotRepository.create({
          baseCurrency,
          rates: filteredRates,
          source: 'exchangerate-api.com',
        }),
      );

      this.logger.log(`FX rates fetched and cached for base: ${baseCurrency}`);

      return { base: baseCurrency, rates: filteredRates, source: 'live' };
    } catch (error) {
      this.logger.warn(
        `FX API fetch failed. Attempting DB fallback. Error: ${(error as Error).message}`,
      );
      return this.fallbackToDbSnapshot(baseCurrency);
    }
  }

  private async fallbackToDbSnapshot(
    baseCurrency: string,
  ): Promise<{ base: string; rates: Record<string, number>; source: string }> {
    const snapshot = await this.snapshotRepository.findOne({
      where: { baseCurrency },
      order: { fetchedAt: 'DESC' },
    });

    if (!snapshot) {
      throw new ServiceUnavailableException(
        'FX rates are temporarily unavailable. Please try again shortly.',
      );
    }

    this.logger.warn(
      `Using stale DB snapshot from ${snapshot.fetchedAt.toISOString()}`,
    );

    return {
      base: baseCurrency,
      rates: snapshot.rates,
      source: `fallback (snapshot from ${snapshot.fetchedAt.toISOString()})`,
    };
  }
}
