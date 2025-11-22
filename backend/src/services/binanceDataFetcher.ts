/**
 * Binance Data Fetcher Service
 *
 * FREE, UNLIMITED API for historical OHLCV data!
 * - No authentication required for public market data
 * - No rate limits on public endpoints
 * - 500 candles per request (automatically paginated)
 * - Supports: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
 *
 * API Documentation: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
 */

import axios from 'axios';
import { CandleData } from './technicalIndicators';

interface BinanceKlineResponse {
  0: number;   // Open time
  1: string;   // Open
  2: string;   // High
  3: string;   // Low
  4: string;   // Close
  5: string;   // Volume
  6: number;   // Close time
  7: string;   // Quote asset volume
  8: number;   // Number of trades
  9: string;   // Taker buy base asset volume
  10: string;  // Taker buy quote asset volume
  11: string;  // Ignore
}

export class BinanceDataFetcher {
  private readonly BASE_URL = 'https://api.binance.com/api/v3';
  private readonly FUTURES_URL = 'https://fapi.binance.com/fapi/v1';

  // Symbol mapping: CoinGecko ID -> Binance Symbol
  private readonly SYMBOL_MAP: Record<string, string> = {
    'bitcoin': 'BTCUSDT',
    'ethereum': 'ETHUSDT',
    'solana': 'SOLUSDT',
    'cardano': 'ADAUSDT',
    'polkadot': 'DOTUSDT',
    'chainlink': 'LINKUSDT',
    'matic-network': 'MATICUSDT',
    'polygon': 'MATICUSDT',
    'avalanche-2': 'AVAXUSDT',
    'uniswap': 'UNIUSDT',
    'cosmos': 'ATOMUSDT',
    'ripple': 'XRPUSDT',
    'dogecoin': 'DOGEUSDT',
    'litecoin': 'LTCUSDT',
    'binancecoin': 'BNBUSDT',
    'tron': 'TRXUSDT',
    'stellar': 'XLMUSDT',
    'monero': 'XMRUSDT',
    'tezos': 'XTZUSDT',
    'eos': 'EOSUSDT',
  };

  /**
   * Convert CoinGecko coin ID to Binance symbol
   */
  private getBinanceSymbol(coinId: string, coinSymbol: string): string {
    // Try mapping first
    if (this.SYMBOL_MAP[coinId.toLowerCase()]) {
      return this.SYMBOL_MAP[coinId.toLowerCase()];
    }

    // Fallback: symbol + USDT
    return `${coinSymbol.toUpperCase()}USDT`;
  }

  /**
   * Fetch historical klines (candlestick) data from Binance
   * Automatically handles pagination for large datasets
   */
  private async fetchKlines(
    symbol: string,
    interval: string,
    limit: number,
    endTime?: number
  ): Promise<BinanceKlineResponse[]> {
    const MAX_PER_REQUEST = 500; // Binance limit
    const allKlines: BinanceKlineResponse[] = [];

    try {
      while (allKlines.length < limit) {
        const requestLimit = Math.min(MAX_PER_REQUEST, limit - allKlines.length);

        const params: any = {
          symbol,
          interval,
          limit: requestLimit,
        };

        if (endTime) {
          params.endTime = endTime;
        }

        const response = await axios.get(`${this.BASE_URL}/klines`, { params });
        const klines = response.data as BinanceKlineResponse[];

        if (klines.length === 0) {
          break; // No more data available
        }

        allKlines.unshift(...klines); // Add to beginning (oldest first)

        // If we got less than requested, no more data available
        if (klines.length < requestLimit) {
          break;
        }

        // For next iteration, fetch older data
        endTime = klines[0][0] - 1; // 1ms before oldest candle
      }

      return allKlines.slice(-limit); // Return only requested amount
    } catch (error: any) {
      throw new Error(`Binance API error: ${error.message}`);
    }
  }

  /**
   * Convert Binance kline to CandleData format
   */
  private convertToCandle(kline: BinanceKlineResponse): CandleData {
    return {
      time: kline[0],
      timestamp: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    };
  }

  /**
   * Fetch 1-minute candles
   */
  async fetch1MinCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '1m', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch 5-minute candles
   */
  async fetch5MinCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '5m', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch 15-minute candles
   */
  async fetch15MinCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '15m', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch 30-minute candles
   */
  async fetch30MinCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '30m', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch 1-hour candles
   */
  async fetch1HourCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '1h', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch 4-hour candles
   */
  async fetch4HourCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '4h', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch daily candles
   */
  async fetchDailyCandles(coinId: string, coinSymbol: string, limit: number = 100): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);
    const klines = await this.fetchKlines(symbol, '1d', limit);
    return klines.map(k => this.convertToCandle(k));
  }

  /**
   * Fetch candles with custom date range
   */
  async fetchCandlesInRange(
    coinId: string,
    coinSymbol: string,
    interval: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d',
    startDate: Date,
    endDate: Date
  ): Promise<CandleData[]> {
    const symbol = this.getBinanceSymbol(coinId, coinSymbol);

    // Calculate how many candles we need based on time range
    const intervalMs: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const timeRange = endDate.getTime() - startDate.getTime();
    const estimatedCandles = Math.ceil(timeRange / intervalMs[interval]);
    const limit = Math.min(estimatedCandles + 10, 1000); // Add buffer, max 1000

    const klines = await this.fetchKlines(symbol, interval, limit, endDate.getTime());

    // Filter to exact date range
    const candles = klines
      .map(k => this.convertToCandle(k))
      .filter(c => c.time >= startDate.getTime() && c.time <= endDate.getTime());

    return candles;
  }

  /**
   * Test connection to Binance API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.BASE_URL}/ping`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get server time (for testing)
   */
  async getServerTime(): Promise<number> {
    const response = await axios.get(`${this.BASE_URL}/time`);
    return response.data.serverTime;
  }
}

// Export singleton instance
export const binanceDataFetcher = new BinanceDataFetcher();
