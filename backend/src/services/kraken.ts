/**
 * Kraken API Service
 * Free, unlimited, no API key required
 * No geo-blocking - perfect for US servers
 */

import axios from 'axios';
import { CandleData } from './technicalIndicators';

export class KrakenService {
  private baseUrl = 'https://api.kraken.com/0/public';

  // Map common symbols to Kraken pairs
  private symbolMap: Record<string, string> = {
    BTC: 'XXBTZUSD',
    ETH: 'XETHZUSD',
    SOL: 'SOLUSD',
    BCH: 'BCHUSD',
    AXS: 'AXSUSD',
    WBTC: 'XXBTZUSD', // Fallback to BTC
  };

  /**
   * Get OHLC candlestick data from Kraken
   * Interval options: 1, 5, 15, 30, 60, 240, 1440 (minutes)
   */
  async getOHLC(symbol: string, interval: number = 15, limit: number = 100): Promise<CandleData[] | null> {
    try {
      const cleanSymbol = symbol.replace('USDT', '').replace('USD', '');
      const pair = this.symbolMap[cleanSymbol] || `${cleanSymbol}USD`;

      const response = await axios.get(`${this.baseUrl}/OHLC`, {
        params: {
          pair,
          interval, // 15 = 15-minute candles
        },
      });

      if (response.data.error && response.data.error.length > 0) {
        console.log(`Kraken error for ${symbol}: ${response.data.error.join(', ')}`);
        return null;
      }

      const resultKey = Object.keys(response.data.result).find(key => key !== 'last');
      if (!resultKey || !response.data.result[resultKey]) {
        return null;
      }

      const rawCandles = response.data.result[resultKey];

      // Kraken OHLC format: [time, open, high, low, close, vwap, volume, count]
      const candles: CandleData[] = rawCandles
        .slice(-limit) // Get last 'limit' candles
        .map((candle: any[]) => ({
          time: candle[0] * 1000, // Convert to milliseconds
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[6]),
        }));

      return candles;
    } catch (error: any) {
      console.log(`Kraken fetch error for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get current ticker price for a coin
   */
  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const cleanSymbol = symbol.replace('USDT', '').replace('USD', '');
      const pair = this.symbolMap[cleanSymbol] || `${cleanSymbol}USD`;

      const response = await axios.get(`${this.baseUrl}/Ticker`, {
        params: { pair },
      });

      if (response.data.error && response.data.error.length > 0) {
        return null;
      }

      const resultKey = Object.keys(response.data.result)[0];
      if (!resultKey) {
        return null;
      }

      // Ticker format has 'c' for last trade closed: ['price', 'lot volume']
      return parseFloat(response.data.result[resultKey].c[0]);
    } catch (error: any) {
      console.log(`Kraken price error for ${symbol}: ${error.message}`);
      return null;
    }
  }
}

export const krakenService = new KrakenService();
