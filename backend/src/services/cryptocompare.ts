/**
 * CryptoCompare API Service
 * Free tier: 100,000 requests/month
 * Provides OHLC candlestick data in minute, hourly, and daily intervals
 */

import axios from 'axios';
import { CandleData } from './technicalIndicators';

interface CryptoCompareCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumefrom: number;
  volumeto: number;
}

export class CryptoCompareService {
  private baseUrl = 'https://min-api.cryptocompare.com/data';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CRYPTOCOMPARE_API_KEY;
  }

  /**
   * Get 15-minute OHLC candlestick data
   * CryptoCompare uses 'histominute' endpoint with aggregate parameter
   */
  async get15MinCandles(symbol: string, limit: number = 100): Promise<CandleData[] | null> {
    try {
      // CryptoCompare uses base currency symbols (BTC, ETH, etc.)
      const cleanSymbol = symbol.replace('USDT', '').replace('USD', '');

      const params: any = {
        fsym: cleanSymbol,
        tsym: 'USD',
        limit: limit,
        aggregate: 15, // Aggregate 15 x 1-minute candles = 15-minute candles
      };

      if (this.apiKey) {
        params.api_key = this.apiKey;
      }

      const response = await axios.get(`${this.baseUrl}/v2/histominute`, { params });

      if (response.data.Response === 'Error') {
        console.log(`CryptoCompare error for ${symbol}: ${response.data.Message}`);
        return null;
      }

      if (!response.data.Data || !response.data.Data.Data) {
        return null;
      }

      const candles: CandleData[] = response.data.Data.Data.map((candle: CryptoCompareCandle) => ({
        time: candle.time * 1000, // Convert to milliseconds
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volumeto, // Volume in USD
      }));

      // Filter out candles with no data (all zeros)
      return candles.filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);
    } catch (error: any) {
      console.log(`CryptoCompare fetch error for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get 1-hour candlestick data
   * CryptoCompare uses 'histohour' endpoint for hourly data
   */
  async get1HourCandles(symbol: string, limit: number = 100): Promise<CandleData[] | null> {
    try {
      // CryptoCompare uses base currency symbols (BTC, ETH, etc.)
      const cleanSymbol = symbol.replace('USDT', '').replace('USD', '');

      const params: any = {
        fsym: cleanSymbol,
        tsym: 'USD',
        limit: limit,
      };

      if (this.apiKey) {
        params.api_key = this.apiKey;
      }

      const response = await axios.get(`${this.baseUrl}/v2/histohour`, { params });

      if (response.data.Response === 'Error') {
        console.log(`CryptoCompare error for ${symbol}: ${response.data.Message}`);
        return null;
      }

      if (!response.data.Data || !response.data.Data.Data) {
        return null;
      }

      const candles: CandleData[] = response.data.Data.Data.map((candle: CryptoCompareCandle) => ({
        time: candle.time * 1000, // Convert to milliseconds
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volumeto, // Volume in USD
      }));

      // Filter out candles with no data (all zeros)
      return candles.filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);
    } catch (error: any) {
      console.log(`CryptoCompare 1H fetch error for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get current price for a coin
   */
  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const cleanSymbol = symbol.replace('USDT', '').replace('USD', '');

      const params: any = {
        fsym: cleanSymbol,
        tsyms: 'USD',
      };

      if (this.apiKey) {
        params.api_key = this.apiKey;
      }

      const response = await axios.get(`${this.baseUrl}/price`, { params });

      return response.data.USD || null;
    } catch (error: any) {
      console.log(`CryptoCompare price error for ${symbol}: ${error.message}`);
      return null;
    }
  }
}

export const cryptocompareService = new CryptoCompareService();
