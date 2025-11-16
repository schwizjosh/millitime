import { FastifyInstance } from 'fastify';
import { coingeckoService } from './coingecko';
import cron from 'node-cron';

interface TechnicalIndicators {
  rsi?: number;
  macd?: { value: number; signal: number; histogram: number };
  priceChange24h: number;
  priceChangePercentage24h: number;
  volumeChange?: number;
}

export class SignalGenerator {
  private fastify: FastifyInstance;
  private isRunning = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Start the signal generation cron job
   * Runs every 5 minutes
   */
  start() {
    if (this.isRunning) {
      this.fastify.log.info('Signal generator is already running');
      return;
    }

    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      this.fastify.log.info('Running signal generation...');
      await this.generateSignals();
    });

    // Also run immediately on start
    this.generateSignals();

    this.isRunning = true;
    this.fastify.log.info('Signal generator started');
  }

  /**
   * Generate signals for all active watchlist items
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

      const coinIds = watchlistResult.rows.map((row: any) => row.coin_id);

      // Fetch current market data
      const marketData = await coingeckoService.getCoinsMarkets(coinIds);

      for (const coin of marketData) {
        // Store price history
        await client.query(
          `INSERT INTO price_history
           (coin_id, price, market_cap, volume_24h, price_change_24h, price_change_percentage_24h)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            coin.id,
            coin.current_price,
            coin.market_cap,
            coin.total_volume,
            coin.price_change_24h,
            coin.price_change_percentage_24h,
          ]
        );

        // Get historical prices for this coin (last 24 hours)
        const historyResult = await client.query(
          `SELECT price, timestamp
           FROM price_history
           WHERE coin_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
           ORDER BY timestamp ASC`,
          [coin.id]
        );

        // Analyze and generate signals
        const signal = this.analyzeAndGenerateSignal(coin, historyResult.rows);

        if (signal) {
          // Get users watching this coin
          const usersResult = await client.query(
            'SELECT user_id FROM watchlist WHERE coin_id = $1 AND is_active = true',
            [coin.id]
          );

          // Create signal for each user
          for (const user of usersResult.rows) {
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
          }

          this.fastify.log.info(
            `Generated ${signal.type} signal for ${coin.symbol} at $${coin.current_price}`
          );
        }
      }
    } catch (error: any) {
      this.fastify.log.error('Error generating signals:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Analyze price data and generate trading signal
   */
  private analyzeAndGenerateSignal(
    coin: any,
    priceHistory: any[]
  ): { type: 'BUY' | 'SELL' | 'HOLD'; strength: string; indicators: TechnicalIndicators; message: string } | null {
    const indicators: TechnicalIndicators = {
      priceChange24h: coin.price_change_24h,
      priceChangePercentage24h: coin.price_change_percentage_24h,
    };

    // Simple signal generation based on price changes and volume
    const priceChangePercent = coin.price_change_percentage_24h;

    // Calculate RSI (simplified - using 24h price change as proxy)
    // In production, you'd calculate proper RSI with 14 periods
    const rsi = this.calculateSimpleRSI(priceHistory);
    indicators.rsi = rsi;

    // Signal generation logic
    let signalType: 'BUY' | 'SELL' | 'HOLD' | null = null;
    let strength: 'STRONG' | 'MODERATE' | 'WEAK' = 'MODERATE';
    let message = '';

    // Strong buy signals
    if (priceChangePercent < -10 && rsi < 30) {
      signalType = 'BUY';
      strength = 'STRONG';
      message = `Strong buy opportunity: ${coin.symbol} is oversold (RSI: ${rsi.toFixed(2)}) and down ${Math.abs(priceChangePercent).toFixed(2)}% in 24h`;
    }
    // Moderate buy signals
    else if (priceChangePercent < -5 && rsi < 40) {
      signalType = 'BUY';
      strength = 'MODERATE';
      message = `Buy signal: ${coin.symbol} shows oversold conditions (RSI: ${rsi.toFixed(2)}) with ${Math.abs(priceChangePercent).toFixed(2)}% decline`;
    }
    // Strong sell signals
    else if (priceChangePercent > 15 && rsi > 70) {
      signalType = 'SELL';
      strength = 'STRONG';
      message = `Strong sell signal: ${coin.symbol} is overbought (RSI: ${rsi.toFixed(2)}) and up ${priceChangePercent.toFixed(2)}% in 24h`;
    }
    // Moderate sell signals
    else if (priceChangePercent > 8 && rsi > 60) {
      signalType = 'SELL';
      strength = 'MODERATE';
      message = `Sell signal: ${coin.symbol} shows overbought conditions (RSI: ${rsi.toFixed(2)}) with ${priceChangePercent.toFixed(2)}% gain`;
    }
    // Weak buy on dip
    else if (priceChangePercent < -3) {
      signalType = 'BUY';
      strength = 'WEAK';
      message = `Potential buy opportunity: ${coin.symbol} dipped ${Math.abs(priceChangePercent).toFixed(2)}% in 24h`;
    }
    // Significant price movement notification
    else if (Math.abs(priceChangePercent) > 10) {
      signalType = 'HOLD';
      strength = 'MODERATE';
      message = `High volatility alert: ${coin.symbol} ${priceChangePercent > 0 ? 'up' : 'down'} ${Math.abs(priceChangePercent).toFixed(2)}% - monitor closely`;
    }

    if (!signalType) {
      return null;
    }

    return {
      type: signalType,
      strength,
      indicators,
      message,
    };
  }

  /**
   * Calculate simplified RSI using price history
   * In production, use proper RSI calculation with 14 periods
   */
  private calculateSimpleRSI(priceHistory: any[]): number {
    if (priceHistory.length < 2) {
      return 50; // Neutral if not enough data
    }

    let gains = 0;
    let losses = 0;
    let count = 0;

    for (let i = 1; i < priceHistory.length; i++) {
      const change = priceHistory[i].price - priceHistory[i - 1].price;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
      count++;
    }

    if (count === 0) return 50;

    const avgGain = gains / count;
    const avgLoss = losses / count;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }
}
