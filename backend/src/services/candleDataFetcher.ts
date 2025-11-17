import { binanceService } from './binance';
import { coingeckoService } from './coingecko';
import { cryptocompareService } from './cryptocompare';
import { krakenService } from './kraken';
import { CandleData } from './technicalIndicators';

/**
 * Hybrid candle data fetcher that tries multiple sources
 * Priority (2025 optimized for reliability):
 * 1. CryptoCompare (100K free/month, no geo-blocking)
 * 2. Kraken (unlimited free, no geo-blocking, US-friendly)
 * 3. Binance (geo-blocked in US but kept as fallback)
 * 4. CoinGecko (rate limited but universal fallback)
 */
export class CandleDataFetcher {
  /**
   * Convert CoinGecko price data to 15-minute candlesticks
   */
  private convertToCandlesFromPriceData(priceData: number[][]): CandleData[] {
    if (!priceData || priceData.length === 0) {
      return [];
    }

    // CoinGecko returns [timestamp, price] for 1 day = ~5-minute intervals
    // We need to aggregate into 15-minute candles
    const candles: CandleData[] = [];
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds

    // Group by 15-minute intervals
    const grouped: Map<number, number[]> = new Map();

    for (const [timestamp, price] of priceData) {
      const intervalStart = Math.floor(timestamp / interval) * interval;
      if (!grouped.has(intervalStart)) {
        grouped.set(intervalStart, []);
      }
      grouped.get(intervalStart)!.push(price);
    }

    // Convert grouped prices to OHLC candles
    for (const [timestamp, prices] of grouped) {
      if (prices.length > 0) {
        candles.push({
          time: timestamp,
          open: prices[0],
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: prices[prices.length - 1],
          volume: 0, // CoinGecko price endpoint doesn't provide volume
        });
      }
    }

    return candles.sort((a, b) => a.time - b.time);
  }

  /**
   * Convert CoinGecko OHLC data to our CandleData format
   */
  private convertOHLCToCandleData(ohlcData: number[][]): CandleData[] {
    // OHLC format: [timestamp, open, high, low, close]
    return ohlcData.map(ohlc => ({
      time: ohlc[0],
      open: ohlc[1],
      high: ohlc[2],
      low: ohlc[3],
      close: ohlc[4],
      volume: 0, // CoinGecko OHLC doesn't provide volume
    }));
  }

  /**
   * Fetch 15-minute candlestick data from multiple sources
   * @param coinId - CoinGecko coin ID
   * @param coinSymbol - Coin symbol (e.g., 'BTC')
   * @param limit - Number of candles to fetch (default: 100 = 25 hours)
   */
  async fetch15MinCandles(
    coinId: string,
    coinSymbol: string,
    limit: number = 100
  ): Promise<CandleData[] | null> {
    // 1. Try CryptoCompare first (100K free/month, reliable)
    try {
      const cryptoCompareCandles = await cryptocompareService.get15MinCandles(coinSymbol, limit);

      if (cryptoCompareCandles && cryptoCompareCandles.length >= 50) {
        console.log(`✅ Fetched ${cryptoCompareCandles.length} candles from CryptoCompare for ${coinSymbol}`);
        return cryptoCompareCandles;
      }
    } catch (error: any) {
      console.log(`CryptoCompare failed for ${coinSymbol}, trying Kraken...`);
    }

    // 2. Try Kraken (unlimited free, no geo-blocking)
    try {
      const krakenCandles = await krakenService.getOHLC(coinSymbol, 15, limit);

      if (krakenCandles && krakenCandles.length >= 50) {
        console.log(`✅ Fetched ${krakenCandles.length} candles from Kraken for ${coinSymbol}`);
        return krakenCandles;
      }
    } catch (error: any) {
      console.log(`Kraken failed for ${coinSymbol}, trying Binance...`);
    }

    // 3. Try Binance (geo-blocked in US but kept as fallback)
    try {
      const binanceCandles = await binanceService.get15MinCandlesByCoinId(
        coinId,
        coinSymbol,
        limit
      );

      if (binanceCandles && binanceCandles.length >= 50) {
        console.log(`✅ Fetched ${binanceCandles.length} candles from Binance for ${coinSymbol}`);
        return binanceCandles;
      }
    } catch (error: any) {
      console.log(`Binance failed for ${coinSymbol}, trying CoinGecko...`);
    }

    // 4. Final fallback: CoinGecko market_chart (5-min data aggregated to 15-min)
    try {
      const marketChart = await coingeckoService.getMarketChart(coinId, 1);

      if (marketChart && marketChart.prices) {
        const candles = this.convertToCandlesFromPriceData(marketChart.prices);

        if (candles.length >= 50) {
          console.log(`✅ Fetched ${candles.length} candles from CoinGecko market_chart for ${coinSymbol}`);
          return candles.slice(-limit); // Return last 'limit' candles
        }
      }
    } catch (error: any) {
      console.log(`CoinGecko market_chart failed for ${coinSymbol}: ${error.message}`);
    }

    // Last resort: CoinGecko OHLC (hourly data - not ideal but better than nothing)
    try {
      const ohlcData = await coingeckoService.getOHLC(coinId, 2); // 2 days of hourly data

      if (ohlcData && ohlcData.length > 0) {
        const candles = this.convertOHLCToCandleData(ohlcData);

        if (candles.length >= 20) {
          console.log(`⚠️  Using hourly OHLC data from CoinGecko for ${coinSymbol} (${candles.length} candles)`);
          return candles.slice(-limit);
        }
      }
    } catch (error: any) {
      console.log(`CoinGecko OHLC failed for ${coinSymbol}: ${error.message}`);
    }

    console.log(`❌ Failed to fetch candle data for ${coinSymbol} from all sources`);
    return null;
  }

  /**
   * Fetch candles for multiple coins in parallel
   */
  async fetchMultipleCoins(
    coins: Array<{ coinId: string; coinSymbol: string }>,
    limit: number = 100
  ): Promise<Map<string, CandleData[]>> {
    const results = new Map<string, CandleData[]>();

    const promises = coins.map(async (coin) => {
      const candles = await this.fetch15MinCandles(coin.coinId, coin.coinSymbol, limit);
      if (candles) {
        results.set(coin.coinId, candles);
      }
    });

    await Promise.all(promises);
    return results;
  }
}

export const candleDataFetcher = new CandleDataFetcher();
