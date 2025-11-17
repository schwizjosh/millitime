/**
 * Exchange Integration Service
 * Manages exchange coin listings and filters coins based on user's exchange
 */

import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { ExchangeCoin } from '../types';
import cron from 'node-cron';

export interface ExchangeInfo {
  name: string;
  displayName: string;
  supportsFutures: boolean;
  apiEndpoint?: string;
}

const SUPPORTED_EXCHANGES: Record<string, ExchangeInfo> = {
  binance: {
    name: 'binance',
    displayName: 'Binance',
    supportsFutures: true,
    apiEndpoint: 'https://api.binance.com/api/v3',
  },
  kraken: {
    name: 'kraken',
    displayName: 'Kraken',
    supportsFutures: true,
    apiEndpoint: 'https://api.kraken.com/0/public',
  },
  coinbase: {
    name: 'coinbase',
    displayName: 'Coinbase',
    supportsFutures: false,
    apiEndpoint: 'https://api.exchange.coinbase.com',
  },
  bybit: {
    name: 'bybit',
    displayName: 'Bybit',
    supportsFutures: true,
    apiEndpoint: 'https://api.bybit.com/v5/market',
  },
  okx: {
    name: 'okx',
    displayName: 'OKX',
    supportsFutures: true,
    apiEndpoint: 'https://www.okx.com/api/v5/public',
  },
};

export class ExchangeIntegrationService {
  private fastify: FastifyInstance;
  private isRunning = false;

  // Mapping of common coin symbols to exchange-specific trading pairs
  private readonly SYMBOL_MAPPINGS: Record<string, Record<string, string>> = {
    binance: { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' },
    kraken: { BTC: 'XXBTZUSD', ETH: 'XETHZUSD' },
    coinbase: { BTC: 'BTC-USD', ETH: 'ETH-USD' },
  };

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Start periodic exchange data sync
   * Updates coin listings weekly
   */
  start() {
    if (this.isRunning) {
      this.fastify.log.info('Exchange integration service is already running');
      return;
    }

    // Sync exchange data weekly (Sunday at 1 AM)
    cron.schedule('0 1 * * 0', async () => {
      this.fastify.log.info('Syncing exchange coin listings...');
      await this.syncAllExchanges();
    });

    // Also run on startup
    this.syncAllExchanges();

    this.isRunning = true;
    this.fastify.log.info('Exchange integration service started');
  }

  /**
   * Sync coin listings from all supported exchanges
   */
  async syncAllExchanges(): Promise<void> {
    const client = await this.fastify.pg.connect();

    try {
      for (const exchangeName of Object.keys(SUPPORTED_EXCHANGES)) {
        try {
          const coins = await this.fetchExchangeCoins(exchangeName);
          this.fastify.log.info(`Fetched ${coins.length} coins from ${exchangeName}`);

          // Store in database
          for (const coin of coins) {
            await client.query(
              `INSERT INTO exchange_coins
               (exchange_name, coin_id, coin_symbol, trading_pair, is_futures_available, last_updated)
               VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
               ON CONFLICT (exchange_name, coin_id)
               DO UPDATE SET
                 trading_pair = $4,
                 is_futures_available = $5,
                 last_updated = CURRENT_TIMESTAMP`,
              [
                coin.exchange_name,
                coin.coin_id,
                coin.coin_symbol,
                coin.trading_pair,
                coin.is_futures_available,
              ]
            );
          }
        } catch (error) {
          this.fastify.log.error(`Error syncing ${exchangeName}:`, error);
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Fetch available coins from a specific exchange
   */
  private async fetchExchangeCoins(exchangeName: string): Promise<Partial<ExchangeCoin>[]> {
    const exchange = SUPPORTED_EXCHANGES[exchangeName];
    if (!exchange || !exchange.apiEndpoint) {
      return [];
    }

    try {
      switch (exchangeName) {
        case 'binance':
          return await this.fetchBinanceCoins();
        case 'kraken':
          return await this.fetchKrakenCoins();
        case 'coinbase':
          return await this.fetchCoinbaseCoins();
        case 'bybit':
          return await this.fetchBybitCoins();
        default:
          return [];
      }
    } catch (error) {
      this.fastify.log.error(`Error fetching coins from ${exchangeName}:`, error);
      return [];
    }
  }

  /**
   * Fetch Binance coins
   */
  private async fetchBinanceCoins(): Promise<Partial<ExchangeCoin>[]> {
    try {
      // Fetch spot trading pairs
      const spotResponse = await axios.get('https://api.binance.com/api/v3/exchangeInfo', {
        timeout: 10000,
      });

      // Fetch futures trading pairs
      let futuresSymbols = new Set<string>();
      try {
        const futuresResponse = await axios.get(
          'https://fapi.binance.com/fapi/v1/exchangeInfo',
          { timeout: 10000 }
        );
        futuresSymbols = new Set(
          futuresResponse.data.symbols
            .filter((s: any) => s.status === 'TRADING')
            .map((s: any) => s.symbol)
        );
      } catch (e) {
        this.fastify.log.warn('Could not fetch Binance futures data');
      }

      const coins: Partial<ExchangeCoin>[] = [];
      const processedSymbols = new Set<string>();

      for (const symbol of spotResponse.data.symbols) {
        if (symbol.status !== 'TRADING' || !symbol.symbol.endsWith('USDT')) {
          continue;
        }

        const baseAsset = symbol.baseAsset;
        const tradingPair = symbol.symbol;

        if (processedSymbols.has(baseAsset)) {
          continue;
        }
        processedSymbols.add(baseAsset);

        coins.push({
          exchange_name: 'binance',
          coin_id: baseAsset.toLowerCase(),
          coin_symbol: baseAsset,
          trading_pair: tradingPair,
          is_futures_available: futuresSymbols.has(tradingPair),
        });
      }

      return coins;
    } catch (error) {
      this.fastify.log.error('Error fetching Binance coins:', error);
      return [];
    }
  }

  /**
   * Fetch Kraken coins
   */
  private async fetchKrakenCoins(): Promise<Partial<ExchangeCoin>[]> {
    try {
      const response = await axios.get('https://api.kraken.com/0/public/AssetPairs', {
        timeout: 10000,
      });

      const coins: Partial<ExchangeCoin>[] = [];
      const processedSymbols = new Set<string>();

      for (const [pairName, pairData] of Object.entries(response.data.result)) {
        const pair: any = pairData;
        if (!pair.wsname || !pair.wsname.includes('USD')) {
          continue;
        }

        const baseSymbol = pair.base;
        if (processedSymbols.has(baseSymbol)) {
          continue;
        }
        processedSymbols.add(baseSymbol);

        coins.push({
          exchange_name: 'kraken',
          coin_id: baseSymbol.toLowerCase().replace(/^x|^z/, ''), // Remove X/Z prefix
          coin_symbol: baseSymbol.replace(/^x|^z/, ''),
          trading_pair: pairName,
          is_futures_available: false, // Kraken has separate futures platform
        });
      }

      return coins;
    } catch (error) {
      this.fastify.log.error('Error fetching Kraken coins:', error);
      return [];
    }
  }

  /**
   * Fetch Coinbase coins
   */
  private async fetchCoinbaseCoins(): Promise<Partial<ExchangeCoin>[]> {
    try {
      const response = await axios.get('https://api.exchange.coinbase.com/products', {
        timeout: 10000,
      });

      const coins: Partial<ExchangeCoin>[] = [];
      const processedSymbols = new Set<string>();

      for (const product of response.data) {
        if (!product.quote_currency || product.quote_currency !== 'USD') {
          continue;
        }

        const baseSymbol = product.base_currency;
        if (processedSymbols.has(baseSymbol)) {
          continue;
        }
        processedSymbols.add(baseSymbol);

        coins.push({
          exchange_name: 'coinbase',
          coin_id: baseSymbol.toLowerCase(),
          coin_symbol: baseSymbol,
          trading_pair: product.id,
          is_futures_available: false,
        });
      }

      return coins;
    } catch (error) {
      this.fastify.log.error('Error fetching Coinbase coins:', error);
      return [];
    }
  }

  /**
   * Fetch Bybit coins
   */
  private async fetchBybitCoins(): Promise<Partial<ExchangeCoin>[]> {
    try {
      const response = await axios.get(
        'https://api.bybit.com/v5/market/instruments-info?category=spot',
        { timeout: 10000 }
      );

      const coins: Partial<ExchangeCoin>[] = [];
      const processedSymbols = new Set<string>();

      for (const instrument of response.data.result.list || []) {
        if (!instrument.symbol.endsWith('USDT')) {
          continue;
        }

        const baseSymbol = instrument.baseCoin;
        if (processedSymbols.has(baseSymbol)) {
          continue;
        }
        processedSymbols.add(baseSymbol);

        coins.push({
          exchange_name: 'bybit',
          coin_id: baseSymbol.toLowerCase(),
          coin_symbol: baseSymbol,
          trading_pair: instrument.symbol,
          is_futures_available: true, // Bybit has strong futures support
        });
      }

      return coins;
    } catch (error) {
      this.fastify.log.error('Error fetching Bybit coins:', error);
      return [];
    }
  }

  /**
   * Check if a coin is available on a specific exchange
   */
  async isCoinAvailable(
    exchangeName: string,
    coinId: string,
    requireFutures: boolean = false
  ): Promise<boolean> {
    const client = await this.fastify.pg.connect();

    try {
      const query = requireFutures
        ? `SELECT COUNT(*) FROM exchange_coins
           WHERE exchange_name = $1 AND coin_id = $2 AND is_futures_available = true`
        : `SELECT COUNT(*) FROM exchange_coins
           WHERE exchange_name = $1 AND coin_id = $2`;

      const result = await client.query(query, [exchangeName, coinId]);
      return parseInt(result.rows[0].count) > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Filter coins based on exchange availability
   */
  async filterCoinsByExchange(
    coinIds: string[],
    exchangeName: string,
    requireFutures: boolean = false
  ): Promise<string[]> {
    if (!exchangeName || !SUPPORTED_EXCHANGES[exchangeName]) {
      return coinIds; // No filtering if exchange not specified
    }

    const client = await this.fastify.pg.connect();

    try {
      const query = requireFutures
        ? `SELECT coin_id FROM exchange_coins
           WHERE exchange_name = $1 AND coin_id = ANY($2::text[]) AND is_futures_available = true`
        : `SELECT coin_id FROM exchange_coins
           WHERE exchange_name = $1 AND coin_id = ANY($2::text[])`;

      const result = await client.query(query, [exchangeName, coinIds]);
      return result.rows.map((row: any) => row.coin_id);
    } finally {
      client.release();
    }
  }

  /**
   * Get all supported exchanges
   */
  getSupportedExchanges(): ExchangeInfo[] {
    return Object.values(SUPPORTED_EXCHANGES);
  }

  /**
   * Get exchange info
   */
  getExchangeInfo(exchangeName: string): ExchangeInfo | undefined {
    return SUPPORTED_EXCHANGES[exchangeName];
  }
}
