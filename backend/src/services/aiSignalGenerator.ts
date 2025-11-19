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
import { FuturesCalculator } from './futuresCalculator';
import { ExchangeIntegrationService } from './exchangeIntegration';
import cron from 'node-cron';
import { fetchTradingSettingsMap } from '../utils/tradingSettings';
import { sendWhatsAppNotification } from './whatsappNotifier';

export class AISignalGenerator {
  private fastify: FastifyInstance;
  private isRunning = false;
  private aiProvider: AIProviderService | null = null;
  private aiStrategy: AITradingStrategyService | null = null;
  private aiEnabled = false;
  private exchangeService: ExchangeIntegrationService;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.exchangeService = new ExchangeIntegrationService(fastify);
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

    // Run every 5 minutes for responsive crypto trading signals
    cron.schedule('*/5 * * * *', async () => {
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
      // Get all unique active coins with user preferences
      const watchlistResult = await client.query(
        `SELECT DISTINCT w.coin_id, w.coin_symbol, w.user_id
         FROM watchlist w
         WHERE w.is_active = true`
      );

      if (watchlistResult.rows.length === 0) {
        this.fastify.log.info('No active coins to monitor');
        return;
      }

      // Get unique coin IDs
      const allCoinIds = Array.from(new Set(watchlistResult.rows.map((row: any) => row.coin_id))) as string[];

      // Fetch market data with fallback
      let marketData: any[] = [];
      try {
        marketData = await coingeckoService.getCoinsMarkets(allCoinIds);
      } catch (error: any) {
        this.fastify.log.warn(
          `CoinGecko market data unavailable (${error.message}), using watchlist data as fallback`
        );
        // Fallback: use watchlist data with latest price from candlestick data
        marketData = watchlistResult.rows.map((row: any) => ({
          id: row.coin_id,
          symbol: row.coin_symbol.toLowerCase(),
          current_price: 0, // Will be populated from candles
          market_cap: 0,
          total_volume: 0,
          price_change_24h: 0,
          price_change_percentage_24h: 0,
        }));
      }

      let totalTokensUsed = 0;

      for (const coin of marketData) {
        // Get candlestick data FIRST (so we can populate price if needed)
        const coinSymbol = coin.symbol.toUpperCase();
        const candles = await candleDataFetcher.fetch15MinCandles(coin.id, coinSymbol, 100);

        if (!candles || candles.length < 50) {
          this.fastify.log.warn(
            `Not enough candlestick data for ${coin.symbol}, skipping`
          );
          continue;
        }

        // If we're using fallback data, populate current_price from latest candle
        if (coin.current_price === 0 && candles.length > 0) {
          coin.current_price = candles[candles.length - 1].close;
          // Calculate 24h change from candles (96 15-min candles = 24 hours)
          const candles24hAgo = candles.length >= 96 ? candles[candles.length - 96] : candles[0];
          coin.price_change_24h = coin.current_price - candles24hAgo.close;
          coin.price_change_percentage_24h = ((coin.current_price - candles24hAgo.close) / candles24hAgo.close) * 100;
        }

        // Store price history (skip if price is still 0)
        if (coin.current_price > 0) {
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
        }

        // Get users watching this coin FIRST to check their AI preferences
        const usersResult = await client.query(
          'SELECT user_id FROM watchlist WHERE coin_id = $1 AND is_active = true',
          [coin.id]
        );

        const userIds = usersResult.rows.map((row: any) => row.user_id);
        const settingsMap = await fetchTradingSettingsMap(client, userIds);

        // Check if ANY user has AI enabled for this coin
        const anyUserWithAI = Array.from(settingsMap.values()).some(
          (s) => s.algo_enabled !== false && s.ai_enabled === true
        );

        // Generate signal with AI only if at least one user wants it
        const signal = await this.analyzeWithAI(coin, candles, anyUserWithAI);

          if (signal) {
            totalTokensUsed += signal.tokensUsed || 0;

            // Create signal for each user
            for (const user of usersResult.rows) {
              const settings = settingsMap.get(user.user_id);
              const algoEnabled = settings ? settings.algo_enabled !== false : true;
              if (!algoEnabled) {
                continue;
              }

              // Check exchange compatibility
              if (settings?.preferred_exchange) {
                const isAvailable = await this.exchangeService.isCoinAvailable(
                  settings.preferred_exchange,
                  coin.id,
                  true // Require futures availability
                );
                if (!isAvailable) {
                  this.fastify.log.debug(
                    `Skipping ${coin.symbol} for user ${user.user_id} - not available on ${settings.preferred_exchange}`
                  );
                  continue;
                }
              }

              // Check for recent signals within 15-minute window
              const recentSignal = await client.query(
                `SELECT id, signal_type, position, leverage, entry_price, stop_loss, take_profit, risk_reward_ratio
                 FROM signals
                 WHERE user_id = $1 AND coin_id = $2
                 AND created_at > NOW() - INTERVAL '15 minutes'
               ORDER BY created_at DESC LIMIT 1`,
              [user.user_id, coin.id]
            );

              // Calculate futures position parameters
              // If recent signal exists with same type, reuse stop_loss to prevent fluctuation
              let futuresPosition = FuturesCalculator.calculatePosition({
                signalType: signal.type,
                currentPrice: coin.current_price,
                technicalIndicators: signal.technicalIndicators,
                confidence: signal.overallScore,
                volatility: signal.technicalIndicators.atr,
              });

              // Reuse stop-loss from recent signal if same direction (within 15-min window)
              if (recentSignal.rows.length > 0 && recentSignal.rows[0].signal_type === signal.type && futuresPosition) {
                const recent = recentSignal.rows[0];
                // Keep the existing stop-loss, entry, and leverage stable
                futuresPosition = {
                  ...futuresPosition,
                  entry_price: recent.entry_price,
                  stop_loss: recent.stop_loss,
                  leverage: recent.leverage,
                  // Recalculate take profit based on stable stop-loss
                  take_profit: recent.take_profit,
                  risk_reward_ratio: recent.risk_reward_ratio,
                };
                this.fastify.log.debug(
                  `Reusing stable stop-loss for ${coin.symbol}: ${recent.stop_loss} (within 15-min window)`
                );
              }

              // Create signal if no duplicate or if STRONG
              if (recentSignal.rows.length === 0 || signal.strength === 'STRONG') {
                await client.query(
                  `INSERT INTO signals
                   (user_id, coin_id, coin_symbol, signal_type, price, strength, indicators, message,
                    position, leverage, entry_price, stop_loss, take_profit, risk_reward_ratio)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
                    this.formatSignalMessage(coin, signal, futuresPosition),
                    futuresPosition?.position,
                    futuresPosition?.leverage,
                    futuresPosition?.entry_price,
                    futuresPosition?.stop_loss,
                    futuresPosition?.take_profit,
                    futuresPosition?.risk_reward_ratio,
                  ]
                );

                // Send background WhatsApp notification if configured
                const runInBackground = settings ? settings.run_in_background !== false : true;
                if (runInBackground && settings?.whatsapp_number) {
                  await sendWhatsAppNotification(this.fastify, {
                    phone: settings.whatsapp_number,
                    message: this.formatSignalMessage(coin, signal, futuresPosition),
                    apiKey: settings.whatsapp_api_key,
                  });
                }
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
      this.fastify.log.error({ error }, 'Error generating AI signals');
    } finally {
      client.release();
    }
  }

  /**
   * Analyze coin with AI enhancement or fallback to technical only
   */
  private async analyzeWithAI(
    coin: any,
    candles: any[],
    useAI: boolean = false
  ): Promise<EnhancedSignal | null> {
    // If AI is enabled globally AND requested by user, use enhanced strategy
    if (this.aiEnabled && this.aiStrategy && useAI) {
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
   * Format comprehensive signal message with futures parameters
   */
  private formatSignalMessage(coin: any, signal: EnhancedSignal, futuresPosition?: any): string {
    const parts: string[] = [];

    parts.push(
      `${coin.symbol.toUpperCase()} @ $${coin.current_price.toFixed(
        coin.current_price < 1 ? 6 : 2
      )}`
    );

    parts.push(`${signal.strength} ${signal.type} - ${signal.overallScore}% confidence`);

    // Add futures parameters
    if (futuresPosition) {
      parts.push(
        `${futuresPosition.position} ${futuresPosition.leverage}x | Entry: $${futuresPosition.entry_price.toFixed(
          coin.current_price < 1 ? 6 : 2
        )} | SL: $${futuresPosition.stop_loss.toFixed(
          coin.current_price < 1 ? 6 : 2
        )} | TP: $${futuresPosition.take_profit.toFixed(
          coin.current_price < 1 ? 6 : 2
        )} | R:R ${futuresPosition.risk_reward_ratio}:1`
      );
    }

    if (signal.aiInsight && signal.aiInsight !== 'AI analysis unavailable') {
      parts.push(`AI: ${signal.aiInsight}`);
    }

    if (signal.reasoning.length > 0) {
      parts.push(`Signals: ${signal.reasoning.slice(0, 2).join(', ')}`);
    }

    if (signal.riskFactors.length > 0) {
      parts.push(`Risks: ${signal.riskFactors.slice(0, 2).join(', ')}`);
    }

    return parts.join(' | ');
  }
}
