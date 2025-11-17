/**
 * AI-Enhanced Signal Generator
 * Drop-in replacement for SignalGenerator with AI capabilities
 */

import { FastifyInstance } from 'fastify';
import { coingeckoService } from './coingecko';
import { candleDataFetcher } from './candleDataFetcher';
import { technicalIndicatorService } from './technicalIndicators';
import { AIProviderService } from './aiProvider';
import { AITradingStrategyService, EnhancedSignal } from './aiTradingStrategy';
import cron from 'node-cron';

export class AISignalGenerator {
  private fastify: FastifyInstance;
  private isRunning = false;
  private aiProvider: AIProviderService | null = null;
  private aiStrategy: AITradingStrategyService | null = null;
  private aiEnabled = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.initializeAI();
  }

  /**
   * Initialize AI services if keys are available
   */
  private initializeAI() {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const aiEnabled = process.env.ENABLE_AI_ANALYSIS !== 'false';

    if (aiEnabled && (openaiKey || anthropicKey)) {
      this.aiProvider = new AIProviderService({
        openaiKey,
        anthropicKey,
        preferredProvider: (process.env.AI_PROVIDER as any) || 'auto',
      });

      this.aiStrategy = new AITradingStrategyService(this.aiProvider);
      this.aiEnabled = true;

      this.fastify.log.info(
        `AI-Enhanced Trading: ENABLED (OpenAI: ${!!openaiKey}, Claude: ${!!anthropicKey})`
      );
    } else {
      this.fastify.log.info('AI-Enhanced Trading: DISABLED (using technical analysis only)');
    }
  }

  /**
   * Start the signal generation cron job
   */
  start() {
    if (this.isRunning) {
      this.fastify.log.info('AI Signal generator is already running');
      return;
    }

    // Run every 15 minutes (at :00, :15, :30, :45)
    cron.schedule('*/15 * * * *', async () => {
      this.fastify.log.info('Running AI-enhanced signal generation...');
      await this.generateSignals();
    });

    // Also run immediately on start
    this.generateSignals();

    this.isRunning = true;
    this.fastify.log.info(
      `AI Signal generator started - ${this.aiEnabled ? 'AI-ENHANCED' : 'TECHNICAL ONLY'} mode`
    );
  }

  /**
   * Generate AI-enhanced signals for all active watchlist items
   */
  private async generateSignals() {
    const client = await this.fastify.pg.connect();

    try {
      // Get all unique active coins
      const watchlistResult = await client.query(
        `SELECT DISTINCT coin_id, coin_symbol FROM watchlist WHERE is_active = true`
      );

      if (watchlistResult.rows.length === 0) {
        this.fastify.log.info('No active coins to monitor');
        return;
      }

      // Fetch market data
      const coinIds = watchlistResult.rows.map((row: any) => row.coin_id);
      const marketData = await coingeckoService.getCoinsMarkets(coinIds);

      let totalTokensUsed = 0;

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

        // Get candlestick data
        const coinSymbol = coin.symbol.toUpperCase();
        const candles = await candleDataFetcher.fetch15MinCandles(coin.id, coinSymbol, 100);

        if (!candles || candles.length < 50) {
          this.fastify.log.warn(
            `Not enough candlestick data for ${coin.symbol}, skipping`
          );
          continue;
        }

        // Generate enhanced signal
        const signal = await this.analyzeWithAI(coin, candles);

        if (signal) {
          totalTokensUsed += signal.tokensUsed || 0;

          // Get users watching this coin
          const usersResult = await client.query(
            'SELECT user_id FROM watchlist WHERE coin_id = $1 AND is_active = true',
            [coin.id]
          );

          // Create signal for each user
          for (const user of usersResult.rows) {
            // Check for recent duplicates
            const recentSignal = await client.query(
              `SELECT id FROM signals
               WHERE user_id = $1 AND coin_id = $2 AND signal_type = $3
               AND created_at > NOW() - INTERVAL '15 minutes'
               ORDER BY created_at DESC LIMIT 1`,
              [user.user_id, coin.id, signal.type]
            );

            // Create signal if no duplicate or if STRONG
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
                  JSON.stringify({
                    ...signal.technicalIndicators,
                    confluence: signal.technicalConfluence,
                    overallScore: signal.overallScore,
                    fundamentalScore: signal.fundamentalScore,
                    aiRecommendation: signal.aiRecommendation,
                  }),
                  this.formatSignalMessage(coin, signal),
                ]
              );
            }
          }

          this.fastify.log.info(
            `Generated ${signal.type} (${signal.strength}) for ${coin.symbol} - ` +
            `Score: ${signal.overallScore}% (TA: ${signal.technicalScore}%, FA: ${signal.fundamentalScore}%) - ` +
            `Tokens: ${signal.tokensUsed}`
          );
        }
      }

      if (totalTokensUsed > 0) {
        this.fastify.log.info(`Total AI tokens used this cycle: ${totalTokensUsed}`);
      }
    } catch (error: any) {
      this.fastify.log.error('Error generating AI signals:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Analyze coin with AI enhancement or fallback to technical only
   */
  private async analyzeWithAI(
    coin: any,
    candles: any[]
  ): Promise<EnhancedSignal | null> {
    // If AI is enabled, use enhanced strategy
    if (this.aiEnabled && this.aiStrategy) {
      try {
        const enhancedSignal = await this.aiStrategy.generateEnhancedSignal(
          coin.id,
          coin.symbol.toUpperCase(),
          coin.current_price,
          candles,
          {
            includeAI: true,
            includeFundamental: true,
          }
        );

        if (enhancedSignal && this.shouldGenerateSignal(enhancedSignal)) {
          return enhancedSignal;
        }
      } catch (error) {
        this.fastify.log.error(`AI analysis failed for ${coin.symbol}, falling back: ${error}`);
        // Fall through to technical-only analysis
      }
    }

    // Fallback: Technical analysis only
    const technicalSignal = technicalIndicatorService.generateConfluenceSignal(candles);
    if (!technicalSignal) {
      return null;
    }

    const shouldGenerate =
      (technicalSignal.type === 'BUY' || technicalSignal.type === 'SELL') &&
      technicalSignal.confidence >= 45;

    if (!shouldGenerate) {
      return null;
    }

    return {
      type: technicalSignal.type,
      strength: technicalSignal.strength,
      confidence: technicalSignal.confidence,
      technicalScore: technicalSignal.confidence,
      technicalConfluence: technicalSignal.confidence,
      technicalIndicators: technicalSignal.indicators,
      fundamentalScore: 50, // Neutral
      fundamentalRecommendation: 'N/A',
      aiInsight: 'Technical analysis only (AI disabled)',
      aiRecommendation: 'HOLD',
      overallScore: technicalSignal.confidence,
      reasoning: technicalSignal.signals || [],
      riskFactors: [],
      provider: 'technical-only',
      tokensUsed: 0,
    };
  }

  /**
   * Determine if enhanced signal should be generated
   */
  private shouldGenerateSignal(signal: EnhancedSignal): boolean {
    // Generate signal if:
    // 1. Strong signal (80%+)
    // 2. Moderate/Weak BUY or SELL with reasonable confidence (50%+)
    // 3. HOLD signals are suppressed unless very high confidence
    if (signal.type === 'HOLD') {
      return signal.overallScore >= 80; // Only show HOLD if very confident
    }

    return signal.overallScore >= 45;
  }

  /**
   * Format comprehensive signal message
   */
  private formatSignalMessage(coin: any, signal: EnhancedSignal): string {
    const parts: string[] = [];

    parts.push(
      `${coin.symbol.toUpperCase()} @ $${coin.current_price.toFixed(
        coin.current_price < 1 ? 6 : 2
      )}`
    );

    parts.push(`${signal.strength} ${signal.type} - ${signal.overallScore}% confidence`);

    if (signal.aiInsight && signal.aiInsight !== 'AI analysis unavailable') {
      parts.push(`AI: ${signal.aiInsight}`);
    }

    if (signal.reasoning.length > 0) {
      parts.push(`Signals: ${signal.reasoning.slice(0, 3).join(', ')}`);
    }

    if (signal.riskFactors.length > 0) {
      parts.push(`Risks: ${signal.riskFactors.join(', ')}`);
    }

    return parts.join(' | ');
  }
}
