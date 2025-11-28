import axios, { AxiosInstance } from 'axios';
import { CoinGeckoMarketData } from '../types';

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class CoinGeckoService {
  private api: AxiosInstance;
  private baseURL = 'https://api.coingecko.com/api/v3';
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private requestDelay = 2000; // 2 seconds between requests to respect rate limits (30/min)

  // Cache storage with TTLs
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL = {
    coinsList: 60 * 60 * 1000,      // 1 hour - rarely changes
    markets: 5 * 60 * 1000,          // 5 minutes
    simplePrice: 2 * 60 * 1000,      // 2 minutes - prices change fast
    trending: 10 * 60 * 1000,        // 10 minutes
    topCoins: 5 * 60 * 1000,         // 5 minutes
    search: 30 * 60 * 1000,          // 30 minutes
    ohlc: 5 * 60 * 1000,             // 5 minutes
    marketChart: 5 * 60 * 1000,      // 5 minutes
    coinDetails: 10 * 60 * 1000,     // 10 minutes
    globalData: 5 * 60 * 1000,       // 5 minutes
  };

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // Clean expired cache entries every 5 minutes
    setInterval(() => this.cleanExpiredCache(), 5 * 60 * 1000);
  }

  /**
   * Get from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      return entry.data as T;
    }
    if (entry) {
      this.cache.delete(key); // Clean expired entry
    }
    return null;
  }

  /**
   * Set cache entry with TTL
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache stats for monitoring
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Rate limit handler - queues requests to avoid hitting API limits
   */
  private async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const request = this.requestQueue.shift();

    if (request) {
      await request();
      await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      this.processQueue();
    }
  }

  /**
   * Get list of all coins
   */
  async getCoinsList(): Promise<Array<{ id: string; symbol: string; name: string }>> {
    const cacheKey = 'coinsList';
    const cached = this.getFromCache<Array<{ id: string; symbol: string; name: string }>>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/coins/list');
      this.setCache(cacheKey, response.data, this.CACHE_TTL.coinsList);
      return response.data;
    });
  }

  /**
   * Get market data for specific coins
   */
  async getCoinsMarkets(
    coinIds: string[],
    vsCurrency: string = 'usd'
  ): Promise<CoinGeckoMarketData[]> {
    const cacheKey = `markets:${coinIds.sort().join(',')}:${vsCurrency}`;
    const cached = this.getFromCache<CoinGeckoMarketData[]>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/coins/markets', {
        params: {
          vs_currency: vsCurrency,
          ids: coinIds.join(','),
          order: 'market_cap_desc',
          per_page: 250,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h',
        },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.markets);
      return response.data;
    });
  }

  /**
   * Get simple price for multiple coins
   */
  async getSimplePrice(
    coinIds: string[],
    vsCurrencies: string[] = ['usd']
  ): Promise<Record<string, Record<string, number>>> {
    const cacheKey = `price:${coinIds.sort().join(',')}:${vsCurrencies.sort().join(',')}`;
    const cached = this.getFromCache<Record<string, Record<string, number>>>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/simple/price', {
        params: {
          ids: coinIds.join(','),
          vs_currencies: vsCurrencies.join(','),
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
          include_last_updated_at: true,
        },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.simplePrice);
      return response.data;
    });
  }

  /**
   * Get trending coins
   */
  async getTrending(): Promise<any> {
    const cacheKey = 'trending';
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/search/trending');
      this.setCache(cacheKey, response.data, this.CACHE_TTL.trending);
      return response.data;
    });
  }

  /**
   * Get top coins by market cap
   */
  async getTopCoins(limit: number = 100, vsCurrency: string = 'usd'): Promise<CoinGeckoMarketData[]> {
    const cacheKey = `topCoins:${limit}:${vsCurrency}`;
    const cached = this.getFromCache<CoinGeckoMarketData[]>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/coins/markets', {
        params: {
          vs_currency: vsCurrency,
          order: 'market_cap_desc',
          per_page: limit,
          page: 1,
          sparkline: false,
        },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.topCoins);
      return response.data;
    });
  }

  /**
   * Search for coins
   */
  async searchCoins(query: string): Promise<any> {
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/search', {
        params: { query },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.search);
      return response.data;
    });
  }

  /**
   * Get OHLC data (candlestick) for a coin
   * Interval: 1 hour for last 24 hours, or 4 hours, daily, etc.
   * @param coinId - CoinGecko coin ID
   * @param days - Number of days (1, 7, 14, 30, 90, 180, 365, max)
   */
  async getOHLC(coinId: string, days: number = 1): Promise<any> {
    const cacheKey = `ohlc:${coinId}:${days}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get(`/coins/${coinId}/ohlc`, {
        params: {
          vs_currency: 'usd',
          days: days,
        },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.ohlc);
      return response.data;
    });
  }

  /**
   * Get market chart data with price, market_cap, and volume
   * Returns data points at intervals based on days requested
   * @param coinId - CoinGecko coin ID
   * @param days - Number of days (1 = 5min intervals, 2-90 = hourly, >90 = daily)
   */
  async getMarketChart(coinId: string, days: number = 1): Promise<any> {
    const cacheKey = `chart:${coinId}:${days}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get(`/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days,
          interval: days === 1 ? '' : 'hourly',
        },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.marketChart);
      return response.data;
    });
  }

  /**
   * Get detailed coin information including market data, supply info, etc.
   * @param coinId - CoinGecko coin ID
   */
  async getCoinDetails(coinId: string): Promise<any> {
    const cacheKey = `details:${coinId}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get(`/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false,
        },
      });
      this.setCache(cacheKey, response.data, this.CACHE_TTL.coinDetails);
      return response.data;
    });
  }

  /**
   * Get global market data including BTC dominance, market cap, etc.
   */
  async getGlobalData(): Promise<any> {
    const cacheKey = 'global';
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    return this.queueRequest(async () => {
      const response = await this.api.get('/global');
      this.setCache(cacheKey, response.data, this.CACHE_TTL.globalData);
      return response.data;
    });
  }
}

// Export singleton instance
export const coingeckoService = new CoinGeckoService();
