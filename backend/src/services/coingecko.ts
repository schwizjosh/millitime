import axios, { AxiosInstance } from 'axios';
import { CoinGeckoMarketData } from '../types';

export class CoinGeckoService {
  private api: AxiosInstance;
  private baseURL = 'https://api.coingecko.com/api/v3';
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private requestDelay = 2000; // 2 seconds between requests to respect rate limits (30/min)

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });
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
    return this.queueRequest(async () => {
      const response = await this.api.get('/coins/list');
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
      return response.data;
    });
  }

  /**
   * Get trending coins
   */
  async getTrending(): Promise<any> {
    return this.queueRequest(async () => {
      const response = await this.api.get('/search/trending');
      return response.data;
    });
  }

  /**
   * Get top coins by market cap
   */
  async getTopCoins(limit: number = 100, vsCurrency: string = 'usd'): Promise<CoinGeckoMarketData[]> {
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
      return response.data;
    });
  }

  /**
   * Search for coins
   */
  async searchCoins(query: string): Promise<any> {
    return this.queueRequest(async () => {
      const response = await this.api.get('/search', {
        params: { query },
      });
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
    return this.queueRequest(async () => {
      const response = await this.api.get(`/coins/${coinId}/ohlc`, {
        params: {
          vs_currency: 'usd',
          days: days,
        },
      });
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
    return this.queueRequest(async () => {
      const response = await this.api.get(`/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days,
          interval: days === 1 ? '' : 'hourly',
        },
      });
      return response.data;
    });
  }

  /**
   * Get detailed coin information including market data, supply info, etc.
   * @param coinId - CoinGecko coin ID
   */
  async getCoinDetails(coinId: string): Promise<any> {
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
      return response.data;
    });
  }
}

// Export singleton instance
export const coingeckoService = new CoinGeckoService();
