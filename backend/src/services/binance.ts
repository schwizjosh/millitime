import axios, { AxiosInstance } from 'axios';
import { CandleData } from './technicalIndicators';

export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  trades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
}

export class BinanceService {
  private api: AxiosInstance;
  private baseURL = 'https://api.binance.com/api/v3';

  // Mapping from CoinGecko IDs to Binance symbols
  private readonly symbolMap: Record<string, string> = {
    'bitcoin': 'BTCUSDT',
    'ethereum': 'ETHUSDT',
    'binancecoin': 'BNBUSDT',
    'ripple': 'XRPUSDT',
    'cardano': 'ADAUSDT',
    'dogecoin': 'DOGEUSDT',
    'solana': 'SOLUSDT',
    'polkadot': 'DOTUSDT',
    'polygon': 'MATICUSDT',
    'avalanche-2': 'AVAXUSDT',
    'chainlink': 'LINKUSDT',
    'uniswap': 'UNIUSDT',
    'litecoin': 'LTCUSDT',
    'stellar': 'XLMUSDT',
    'algorand': 'ALGOUSDT',
    'cosmos': 'ATOMUSDT',
    'tron': 'TRXUSDT',
    'vechain': 'VETUSDT',
    'filecoin': 'FILUSDT',
    'tezos': 'XTZUSDT',
    'monero': 'XMRUSDT',
    'eos': 'EOSUSDT',
    'aave': 'AAVEUSDT',
    'maker': 'MKRUSDT',
    'theta-token': 'THETAUSDT',
    'compound-ether': 'ETHUSDT',
    'pancakeswap-token': 'CAKEUSDT',
    'ftx-token': 'FTTUSDT',
    'hedera-hashgraph': 'HBARUSDT',
    'elrond-erd-2': 'EGLDUSDT',
    'the-graph': 'GRTUSDT',
    'internet-computer': 'ICPUSDT',
    'fantom': 'FTMUSDT',
    'near': 'NEARUSDT',
    'harmony': 'ONEUSDT',
    'zilliqa': 'ZILUSDT',
    'decentraland': 'MANAUSDT',
    'the-sandbox': 'SANDUSDT',
    'axie-infinity': 'AXSUSDT',
    'gala': 'GALAUSDT',
    'enjincoin': 'ENJUSDT',
  };

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Get Binance symbol from CoinGecko ID
   */
  getBinanceSymbol(coinGeckoId: string, coinSymbol?: string): string | null {
    // Check if we have a mapping
    if (this.symbolMap[coinGeckoId]) {
      return this.symbolMap[coinGeckoId];
    }

    // Try to construct symbol from coin symbol
    if (coinSymbol) {
      const symbol = `${coinSymbol.toUpperCase()}USDT`;
      return symbol;
    }

    return null;
  }

  /**
   * Get 15-minute candlestick data (OHLCV)
   * @param symbol - Binance trading pair (e.g., 'BTCUSDT')
   * @param limit - Number of candles to fetch (max 1000, default 100)
   */
  async get15MinCandles(symbol: string, limit: number = 100): Promise<CandleData[]> {
    try {
      const response = await this.api.get('/klines', {
        params: {
          symbol: symbol,
          interval: '15m',
          limit: Math.min(limit, 1000), // Binance max is 1000
        },
      });

      const klines: any[][] = response.data;

      return klines.map(kline => ({
        time: kline[0], // Open time
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      }));
    } catch (error: any) {
      console.error(`Error fetching 15min candles for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get 15-minute candlestick data by CoinGecko ID
   */
  async get15MinCandlesByCoinId(
    coinGeckoId: string,
    coinSymbol: string,
    limit: number = 100
  ): Promise<CandleData[] | null> {
    const binanceSymbol = this.getBinanceSymbol(coinGeckoId, coinSymbol);

    if (!binanceSymbol) {
      console.log(`No Binance symbol found for ${coinGeckoId} (${coinSymbol})`);
      return null;
    }

    try {
      return await this.get15MinCandles(binanceSymbol, limit);
    } catch (error: any) {
      // If symbol not found or geo-blocked (451)
      if (error.response?.status === 400 || error.response?.status === 451) {
        console.log(`Cannot fetch from Binance for ${binanceSymbol}: ${error.response?.status || 'unknown'}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get 1-hour candlestick data
   */
  async get1HourCandles(symbol: string, limit: number = 100): Promise<CandleData[]> {
    try {
      const response = await axios.get(`${this.baseURL}/klines`, {
        params: {
          symbol: symbol,
          interval: '1h',  // 1-hour interval
          limit: limit,
        },
        timeout: 10000,
      });

      return response.data.map((candle: any[]) => ({
        time: candle[0], // Timestamp
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    } catch (error: any) {
      console.error(`Error fetching 1h candles for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get 1-hour candlestick data by CoinGecko ID
   */
  async get1HourCandlesByCoinId(
    coinGeckoId: string,
    coinSymbol: string,
    limit: number = 100
  ): Promise<CandleData[] | null> {
    const binanceSymbol = this.getBinanceSymbol(coinGeckoId, coinSymbol);

    if (!binanceSymbol) {
      console.log(`No Binance symbol found for ${coinGeckoId} (${coinSymbol})`);
      return null;
    }

    try {
      return await this.get1HourCandles(binanceSymbol, limit);
    } catch (error: any) {
      // If symbol not found or geo-blocked (451)
      if (error.response?.status === 400 || error.response?.status === 451) {
        console.log(`Cannot fetch from Binance for ${binanceSymbol}: ${error.response?.status || 'unknown'}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get 4-hour candlestick data
   */
  async get4HourCandles(symbol: string, limit: number = 100): Promise<CandleData[]> {
    try {
      const response = await axios.get(`${this.baseURL}/klines`, {
        params: {
          symbol: symbol,
          interval: '4h',  // 4-hour interval
          limit: limit,
        },
        timeout: 10000,
      });

      return response.data.map((candle: any[]) => ({
        time: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    } catch (error: any) {
      console.error(`Error fetching 4h candles for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get 4-hour candlestick data by CoinGecko ID
   */
  async get4HourCandlesByCoinId(
    coinGeckoId: string,
    coinSymbol: string,
    limit: number = 100
  ): Promise<CandleData[] | null> {
    const binanceSymbol = this.getBinanceSymbol(coinGeckoId, coinSymbol);

    if (!binanceSymbol) {
      console.log(`No Binance symbol found for ${coinGeckoId} (${coinSymbol})`);
      return null;
    }

    try {
      return await this.get4HourCandles(binanceSymbol, limit);
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 451) {
        console.log(`Cannot fetch from Binance for ${binanceSymbol}: ${error.response?.status || 'unknown'}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get daily candlestick data
   */
  async getDailyCandles(symbol: string, limit: number = 100): Promise<CandleData[]> {
    try {
      const response = await axios.get(`${this.baseURL}/klines`, {
        params: {
          symbol: symbol,
          interval: '1d',  // 1-day interval
          limit: limit,
        },
        timeout: 10000,
      });

      return response.data.map((candle: any[]) => ({
        time: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    } catch (error: any) {
      console.error(`Error fetching daily candles for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get daily candlestick data by CoinGecko ID
   */
  async getDailyCandlesByCoinId(
    coinGeckoId: string,
    coinSymbol: string,
    limit: number = 100
  ): Promise<CandleData[] | null> {
    const binanceSymbol = this.getBinanceSymbol(coinGeckoId, coinSymbol);

    if (!binanceSymbol) {
      console.log(`No Binance symbol found for ${coinGeckoId} (${coinSymbol})`);
      return null;
    }

    try {
      return await this.getDailyCandles(binanceSymbol, limit);
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 451) {
        console.log(`Cannot fetch from Binance for ${binanceSymbol}: ${error.response?.status || 'unknown'}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get current price from Binance
   */
  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const response = await this.api.get('/ticker/price', {
        params: { symbol },
      });

      return parseFloat(response.data.price);
    } catch (error: any) {
      console.error(`Error fetching price for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get 24hr ticker statistics
   */
  async get24hrStats(symbol: string): Promise<any> {
    try {
      const response = await this.api.get('/ticker/24hr', {
        params: { symbol },
      });

      return {
        priceChange: parseFloat(response.data.priceChange),
        priceChangePercent: parseFloat(response.data.priceChangePercent),
        weightedAvgPrice: parseFloat(response.data.weightedAvgPrice),
        lastPrice: parseFloat(response.data.lastPrice),
        volume: parseFloat(response.data.volume),
        quoteVolume: parseFloat(response.data.quoteVolume),
        openPrice: parseFloat(response.data.openPrice),
        highPrice: parseFloat(response.data.highPrice),
        lowPrice: parseFloat(response.data.lowPrice),
        openTime: response.data.openTime,
        closeTime: response.data.closeTime,
      };
    } catch (error: any) {
      console.error(`Error fetching 24hr stats for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Check if symbol exists on Binance
   */
  async symbolExists(symbol: string): Promise<boolean> {
    try {
      await this.getCurrentPrice(symbol);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get exchange info to validate symbols
   */
  async getExchangeInfo(): Promise<any> {
    try {
      const response = await this.api.get('/exchangeInfo');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching exchange info:', error.message);
      return null;
    }
  }
}

export const binanceService = new BinanceService();
