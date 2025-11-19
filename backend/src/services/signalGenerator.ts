import { FastifyInstance } from 'fastify';
import { coingeckoService } from './coingecko';
import { candleDataFetcher } from './candleDataFetcher';
import { technicalIndicatorService, TechnicalIndicatorValues } from './technicalIndicators';
import cron from 'node-cron';
import { fetchTradingSettingsMap } from '../utils/tradingSettings';
import { sendWhatsAppNotification } from './whatsappNotifier';

interface TechnicalIndicators extends TechnicalIndicatorValues {
  priceChange24h: number;
  priceChangePercentage24h: number;
  volumeChange?: number;
  confluence?: number;
  signals?: string[];
}

export class SignalGenerator {
  private fastify: FastifyInstance;
  private isRunning = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Start the signal generation cron job
   * Runs every 15 minutes (aligned with 15-minute candlestick timeframe)
   */
  start() {
    if (this.isRunning) {
      this.fastify.log.info('Signal generator is already running');
      return;
    }

    // Run every 15 minutes (at :00, :15, :30, :45)
    cron.schedule('*/15 * * * *', async () => {
      this.fastify.log.info('Running 15-minute signal generation...');
      await this.generateSignals();
    });

    // Also run immediately on start
    this.generateSignals();

    this.isRunning = true;
    this.fastify.log.info('Signal generator started - 15-minute timeframe with advanced technical analysis');
  }

  /**
   * Generate signals for all active watchlist items using 15-minute candlestick data
   */
  private async generateSignals() {
    const client = await this.fastify.pg.connect();

    try {
      // Get all unique active coins from all users' watchlists
      const watchlistResult = await client.query(
        `SELECT DISTINCT coin_id, coin_symbol FROM watchlist WHERE is_active = true`
      );

      if (watchlistResult.rows.length === 0) {
        this.fastify.log.info('No active coins to monitor');
        return;
      }

      // Fetch current market data
      const coinIds = watchlistResult.rows.map((row: any) => row.coin_id);
      const marketData = await coingeckoService.getCoinsMarkets(coinIds);

      // Bulk insert price history for all coins (much faster than individual inserts)
      if (marketData.length > 0) {
        const priceHistoryValues = marketData
          .map(
            (coin: any, index: number) =>
              `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`
          )
          .join(', ');

        const priceHistoryParams = marketData.flatMap((coin: any) => [
          coin.id,
          coin.current_price,
          coin.market_cap,
          coin.total_volume,
          coin.price_change_24h,
          coin.price_change_percentage_24h,
        ]);

        await client.query(
          `INSERT INTO price_history
           (coin_id, price, market_cap, volume_24h, price_change_24h, price_change_percentage_24h)
           VALUES ${priceHistoryValues}`,
          priceHistoryParams
        );

        this.fastify.log.info(`Bulk inserted price history for ${marketData.length} coins`);
      }

      for (const coin of marketData) {
        // Get 15-minute candlestick data from multiple sources (100 candles = 25 hours of data)
        const coinSymbol = coin.symbol.toUpperCase();
        const candles = await candleDataFetcher.fetch15MinCandles(coin.id, coinSymbol, 100);

        if (!candles || candles.length < 50) {
          this.fastify.log.warn(
            `Not enough candlestick data for ${coin.symbol}, skipping advanced analysis`
          );
          continue;
        }

        // Analyze and generate signals using advanced technical indicators
        const signal = this.analyzeWithTechnicalIndicators(coin, candles);

        if (signal) {
          // Get users watching this coin
          const usersResult = await client.query(
            'SELECT user_id FROM watchlist WHERE coin_id = $1 AND is_active = true',
            [coin.id]
          );

          const userIds = usersResult.rows.map((row: any) => row.user_id);
          const settingsMap = await fetchTradingSettingsMap(client, userIds);

          // Create signal for each user (avoid duplicates within 15 minutes)
          for (const user of usersResult.rows) {
            const settings = settingsMap.get(user.user_id);
            const algoEnabled = settings ? settings.algo_enabled !== false : true;
            if (!algoEnabled) {
              continue;
            }

            // Check if we already sent a similar signal in the last 15 minutes
            const recentSignal = await client.query(
              `SELECT id FROM signals
               WHERE user_id = $1 AND coin_id = $2 AND signal_type = $3
               AND created_at > NOW() - INTERVAL '15 minutes'
               ORDER BY created_at DESC LIMIT 1`,
              [user.user_id, coin.id, signal.type]
            );

            // Only create signal if no recent duplicate or if it's a STRONG signal
            if (recentSignal.rows.length === 0 || signal.strength === 'STRONG') {
              await client.query(
                `INSERT INTO signals
                 (user_id, coin_id, coin_symbol, signal_type, price, strength, indicators, message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  user.user_id,
                  coin.id,
                  coin.symbol,
                  signal.type,
                  coin.current_price,
                  signal.strength,
                  JSON.stringify(signal.indicators),
                  signal.message,
                ]
              );

              // Send background WhatsApp notification if configured
              // Only send for MODERATE and STRONG signals (filter out WEAK)
              const runInBackground = settings ? settings.run_in_background !== false : true;
              if (runInBackground && settings?.whatsapp_number && signal.strength !== 'WEAK') {
                await sendWhatsAppNotification(this.fastify, {
                  phone: settings.whatsapp_number,
                  message: signal.message,
                  apiKey: settings.whatsapp_api_key,
                });
                this.fastify.log.info(
                  `📱 WhatsApp sent: ${signal.type} ${signal.strength} for ${coin.symbol}`
                );
              } else if (signal.strength === 'WEAK') {
                this.fastify.log.debug(
                  `Skipping WhatsApp for WEAK ${signal.type} signal on ${coin.symbol}`
                );
              }
            }
          }

          this.fastify.log.info(
            `Generated ${signal.type} (${signal.strength}) signal for ${coin.symbol} at $${coin.current_price} - Confluence: ${signal.indicators.confluence}%`
          );
        }
      }
    } catch (error: any) {
      this.fastify.log.error({ error }, 'Error generating signals');
    } finally {
      client.release();
    }
  }

  /**
   * Analyze 15-minute candlestick data using advanced technical indicators
   * Returns confluence-based trading signals
   */
  private analyzeWithTechnicalIndicators(
    coin: any,
    candles: any[]
  ): { type: 'BUY' | 'SELL' | 'HOLD'; strength: string; indicators: TechnicalIndicators; message: string } | null {
    // Generate confluence signal using multiple technical indicators
    const confluenceSignal = technicalIndicatorService.generateConfluenceSignal(candles);

    if (!confluenceSignal) {
      return null;
    }

    // Only generate signals for BUY/SELL with at least 45% confluence
    // or STRONG signals with 60%+ confluence
    const shouldGenerateSignal =
      (confluenceSignal.type === 'BUY' || confluenceSignal.type === 'SELL') &&
      (confluenceSignal.confidence >= 45 ||
        (confluenceSignal.strength === 'STRONG' && confluenceSignal.confidence >= 60));

    if (!shouldGenerateSignal && confluenceSignal.type !== 'HOLD') {
      return null;
    }

    // Add 24h price change data to indicators
    const indicators: TechnicalIndicators = {
      ...confluenceSignal.indicators,
      priceChange24h: coin.price_change_24h,
      priceChangePercentage24h: coin.price_change_percentage_24h,
      confluence: confluenceSignal.confidence,
      signals: confluenceSignal.signals,
    };

    // Format message with coin symbol and current price
    const formattedMessage = `${coin.symbol.toUpperCase()} @ $${coin.current_price.toFixed(
      coin.current_price < 1 ? 6 : 2
    )} - ${confluenceSignal.message}`;

    return {
      type: confluenceSignal.type,
      strength: confluenceSignal.strength,
      indicators,
      message: formattedMessage,
    };
  }
}
