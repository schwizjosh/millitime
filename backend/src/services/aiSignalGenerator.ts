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
import { PositionTrackerService } from './positionTracker';
import { multiTimeframeAnalyzer } from './multiTimeframeAnalyzer';
import { marketContextService } from './marketContext';
import { sentimentAnalysisService } from './sentimentAnalysis';
import { mlSignalEnhancer } from './mlSignalEnhancer';
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
  private positionTracker: PositionTrackerService;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.exchangeService = new ExchangeIntegrationService(fastify);
    this.positionTracker = new PositionTrackerService(fastify);
    this.initializeAI();
  }

  /**
   * Initialize AI services if keys are available
   */
  private initializeAI() {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const aiEnabled = process.env.ENABLE_AI_ANALYSIS !== 'false';

    if (aiEnabled && (geminiKey || openaiKey || anthropicKey)) {
      this.aiProvider = new AIProviderService({
        geminiKey,
        openaiKey,
        anthropicKey,
        preferredProvider: (process.env.AI_PROVIDER as any) || 'auto',
      });

      this.aiStrategy = new AITradingStrategyService(this.aiProvider);
      this.aiEnabled = true;

      this.fastify.log.info(
        `AI-Enhanced Trading: ENABLED (Gemini: ${!!geminiKey}, OpenAI: ${!!openaiKey}, Claude: ${!!anthropicKey})`
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

    // Run every 5 minutes for rapid market monitoring (with duplicate filtering)
    cron.schedule('*/5 * * * *', async () => {
      this.fastify.log.info('Running AI-enhanced signal generation...');
      await this.generateSignals();
    });

    // Also run immediately on start
    this.generateSignals();

    // Start position tracker (runs every 5 minutes)
    this.positionTracker.start();

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
      // Fetch market context once for this cycle (QUICK WIN)
      const marketContext = await marketContextService.getMarketContext();
      this.fastify.log.info(
        `Market Context: ${marketContextService.getSummary(marketContext)}`
      );

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
        // Get multi-timeframe candlestick data for accurate trend prediction
        const coinSymbol = coin.symbol.toUpperCase();
        const candles1H = await candleDataFetcher.fetch1HourCandles(coin.id, coinSymbol, 100);

        if (!candles1H || candles1H.length < 50) {
          this.fastify.log.warn(
            `Not enough 1H candlestick data for ${coin.symbol}, skipping`
          );
          continue;
        }

        // Fetch higher timeframes for multi-timeframe confirmation (QUICK WIN)
        const candles4H = await candleDataFetcher.fetch4HourCandles(coin.id, coinSymbol, 50);
        const candles1D = await candleDataFetcher.fetchDailyCandles(coin.id, coinSymbol, 30);

        // Analyze multi-timeframe alignment
        const mtfAnalysis = multiTimeframeAnalyzer.analyzeTimeframes(
          candles1H,
          candles4H,
          candles1D
        );

        this.fastify.log.debug(
          `Multi-timeframe for ${coin.symbol}: ${multiTimeframeAnalyzer.getSummary(mtfAnalysis)}`
        );

        // Use candles1H for backward compatibility with existing code
        const candles = candles1H;

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

            // Apply multi-timeframe confidence adjustment (QUICK WIN #1)
            const originalConfidence = signal.overallScore;
            signal.overallScore = Math.max(
              0,
              Math.min(100, signal.overallScore + mtfAnalysis.confidenceAdjustment)
            );

            // Add multi-timeframe reasoning
            if (mtfAnalysis.confidenceAdjustment !== 0) {
              signal.reasoning = [
                ...mtfAnalysis.reasoning,
                ...signal.reasoning,
              ];

              this.fastify.log.info(
                `Multi-timeframe adjustment for ${coin.symbol}: ${originalConfidence}% → ${signal.overallScore}% (${mtfAnalysis.confidenceAdjustment >= 0 ? '+' : ''}${mtfAnalysis.confidenceAdjustment}%)`
              );
            }

            // Apply market context filter (QUICK WIN #2)
            const coinSpecificContext = await marketContextService.getMarketContext(coin.symbol.toUpperCase());
            const confidenceBeforeContext = signal.overallScore;

            signal.overallScore = Math.max(
              0,
              Math.min(100, signal.overallScore + coinSpecificContext.confidenceAdjustment)
            );

            // Add market context warnings to reasoning
            if (coinSpecificContext.warnings.length > 0) {
              signal.reasoning = [
                ...signal.reasoning,
                ...coinSpecificContext.warnings,
              ];

              this.fastify.log.info(
                `Market context adjustment for ${coin.symbol}: ${confidenceBeforeContext}% → ${signal.overallScore}% (${coinSpecificContext.confidenceAdjustment >= 0 ? '+' : ''}${coinSpecificContext.confidenceAdjustment}%) | ${coinSpecificContext.recommendedAction}`
              );
            }

            // Skip signal if market context says AVOID and confidence dropped significantly
            if (coinSpecificContext.recommendedAction === 'AVOID' && signal.overallScore < 45) {
              this.fastify.log.warn(
                `⚠️  Skipping ${signal.type} signal for ${coin.symbol} due to adverse market conditions (${signal.overallScore}% confidence)`
              );
              continue;
            }

            // Apply sentiment analysis (QUICK WIN #4)
            const sentiment = await sentimentAnalysisService.getSentiment(coin.id, coin.symbol.toUpperCase());
            const sentimentAdjustment = sentimentAnalysisService.analyzeSentiment(sentiment, signal.type);
            const confidenceBeforeSentiment = signal.overallScore;

            signal.overallScore = Math.max(
              0,
              Math.min(100, signal.overallScore + sentimentAdjustment.confidenceAdjustment)
            );

            // Add sentiment reasoning
            if (sentimentAdjustment.confidenceAdjustment !== 0) {
              signal.reasoning = [
                ...signal.reasoning,
                ...sentimentAdjustment.warnings,
              ];

              this.fastify.log.info(
                `Sentiment adjustment for ${coin.symbol}: ${confidenceBeforeSentiment}% → ${signal.overallScore}% (${sentimentAdjustment.confidenceAdjustment >= 0 ? '+' : ''}${sentimentAdjustment.confidenceAdjustment}%) | ${sentimentAdjustment.recommendation}`
              );
            }

            // Apply ML prediction (MACHINE LEARNING BOOST)
            // Estimate leverage based on confidence (actual leverage calculated later per user)
            const estimatedLeverage = signal.overallScore >= 80 ? 10 : signal.overallScore >= 70 ? 7 : signal.overallScore >= 60 ? 5 : 3;
            const mlPrediction = await mlSignalEnhancer.predictWinProbability(
              signal,
              signal.technicalIndicators,
              coin.current_price,
              estimatedLeverage
            );
            const confidenceBeforeML = signal.overallScore;

            signal.overallScore = Math.max(
              0,
              Math.min(100, signal.overallScore + mlPrediction.confidenceAdjustment)
            );

            // Add ML reasoning
            if (mlPrediction.confidenceAdjustment !== 0) {
              signal.reasoning = [
                ...signal.reasoning,
                `🤖 ML: ${mlPrediction.winProbability.toFixed(0)}% win probability - ${mlPrediction.recommendation}`,
              ];

              this.fastify.log.info(
                `🤖 ML adjustment for ${coin.symbol}: ${confidenceBeforeML}% → ${signal.overallScore}% (${mlPrediction.confidenceAdjustment >= 0 ? '+' : ''}${mlPrediction.confidenceAdjustment}%) | Win probability: ${mlPrediction.winProbability.toFixed(1)}%`
              );
            }

            // Update signal strength based on final ML-adjusted confidence
            if (signal.overallScore >= 80) {
              signal.strength = 'STRONG';
            } else if (signal.overallScore >= 60) {
              signal.strength = 'MODERATE';
            } else {
              signal.strength = 'WEAK';
            }

            this.fastify.log.info(
              `Processing signal for ${coin.symbol} - ${usersResult.rows.length} users watching`
            );

            // Create signal for each user
            for (const user of usersResult.rows) {
              this.fastify.log.info(
                `Checking user ${user.user_id} for ${coin.symbol}`
              );
              const settings = settingsMap.get(user.user_id);
              this.fastify.log.info(
                `Settings for user ${user.user_id}: algo=${settings?.algo_enabled}, ai=${settings?.ai_enabled}`
              );
              const algoEnabled = settings ? settings.algo_enabled !== false : true;
              if (!algoEnabled) {
                this.fastify.log.info(
                  `Skipping ${coin.symbol} for user ${user.user_id} - algo disabled`
                );
                continue;
              }

              // Check exchange compatibility (DISABLED - exchange sync not working)
              // TODO: Re-enable once exchange data sync is fixed
              /*
              if (settings?.preferred_exchange) {
                this.fastify.log.info(
                  `Checking ${coin.symbol} availability on ${settings.preferred_exchange} for user ${user.user_id}`
                );
                const isAvailable = await this.exchangeService.isCoinAvailable(
                  settings.preferred_exchange,
                  coin.id,
                  false // Allow spot trading (futures requirement removed)
                );
                this.fastify.log.info(
                  `${coin.symbol} on ${settings.preferred_exchange}: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`
                );
                if (!isAvailable) {
                  this.fastify.log.info(
                    `Skipping ${coin.symbol} for user ${user.user_id} - not available on ${settings.preferred_exchange}`
                  );
                  continue;
                }
              }
              */

              // DUPLICATE SIGNAL FILTER: Check if user has an ACTIVE position for this coin
              // Skip signal generation if position exists in same direction
              const activePosition = await client.query(
                `SELECT id, position_type, status
                 FROM trading_positions
                 WHERE user_id = $1 AND coin_id = $2
                 AND status = 'active'
                 ORDER BY opened_at DESC LIMIT 1`,
                [user.user_id, coin.id]
              );

              if (activePosition.rows.length > 0) {
                const position = activePosition.rows[0];
                const positionDirection = position.position_type === 'long' ? 'BUY' : 'SELL';

                // If signal is same direction as active position, skip it (no duplicate)
                if (signal.type === positionDirection) {
                  this.fastify.log.info(
                    `⏭️  Skipping ${signal.type} signal for ${coin.symbol} (user ${user.user_id}) - already has active ${position.position_type.toUpperCase()} position`
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
                this.fastify.log.info(
                  `💾 Saving ${signal.type} (${signal.strength}) for ${coin.symbol} to user ${user.user_id}`
                );
                const signalResult = await client.query(
                  `INSERT INTO signals
                   (user_id, coin_id, coin_symbol, signal_type, price, strength, indicators, message,
                    position, leverage, entry_price, stop_loss, take_profit, risk_reward_ratio)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                   RETURNING id`,
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

                const signalId = signalResult.rows[0].id;

                // Create active position for tracking (only for BUY/SELL signals with futures data)
                const runInBackground = settings ? settings.run_in_background !== false : true;
                this.fastify.log.info(
                  `Position tracker check: runInBackground=${runInBackground}, hasFutures=${!!futuresPosition}, type=${signal.type}, signalId=${signalId}`
                );
                if (runInBackground && futuresPosition && (signal.type === 'BUY' || signal.type === 'SELL')) {
                  this.fastify.log.info(
                    `🎯 Creating position for ${coin.symbol} ${futuresPosition.position} - signal #${signalId}`
                  );
                  try {
                    await this.positionTracker.createPosition(
                      user.user_id,
                      signalId,
                      coin.id,
                      coin.symbol.toUpperCase(),
                      futuresPosition.position as 'LONG' | 'SHORT',
                      futuresPosition.entry_price,
                      futuresPosition.stop_loss,
                      futuresPosition.take_profit,
                      Math.round(futuresPosition.leverage) // Round to integer for database
                    );
                    this.fastify.log.info(
                      `📊 Created active position for ${coin.symbol} ${futuresPosition.position} - user ${user.user_id}`
                    );
                  } catch (posError) {
                    this.fastify.log.error(
                      { error: posError },
                      `Failed to create position for signal ${signalId}`
                    );
                  }
                }

                // Send background WhatsApp notification if configured
                // Only send for MODERATE and STRONG signals (filter out WEAK)
                if (runInBackground && settings?.whatsapp_number && signal.strength !== 'WEAK') {
                  await sendWhatsAppNotification(this.fastify, {
                    phone: settings.whatsapp_number,
                    message: this.formatSignalMessage(coin, signal, futuresPosition),
                    apiKey: settings.whatsapp_api_key,
                  });
                  this.fastify.log.info(
                    `📱 WhatsApp sent: ${signal.type} ${signal.strength} for ${coin.symbol} to user ${user.user_id}`
                  );
                } else if (signal.strength === 'WEAK') {
                  this.fastify.log.debug(
                    `Skipping WhatsApp for WEAK ${signal.type} signal on ${coin.symbol} - only MODERATE/STRONG trigger notifications`
                  );
                }
              } else {
                this.fastify.log.debug(
                  `Skipping duplicate ${signal.type} (${signal.strength}) for ${coin.symbol} user ${user.user_id} - recent signal exists`
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
    // Get current time in WAT (West Africa Time)
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // Signal type emoji
    const signalEmoji = signal.type === 'BUY' ? '🟢' : '🔴';
    const strengthEmoji = signal.strength === 'STRONG' ? '⚡' : signal.strength === 'MODERATE' ? '📊' : '💡';

    const priceStr = coin.current_price.toFixed(coin.current_price < 1 ? 6 : 2);

    let message = `${signalEmoji} *${signal.type} SIGNAL* ${strengthEmoji}\n`;
    message += `⏰ ${timeStr} WAT\n`;
    message += `━━━━━━━━━━━━━━━━\n\n`;

    message += `*${coin.symbol.toUpperCase()}* @ $${priceStr}\n`;
    message += `Confidence: *${signal.overallScore}%* (${signal.strength})\n`;

    // Add futures parameters
    if (futuresPosition) {
      message += `\n📈 *FUTURES SETUP*\n`;
      message += `Position: ${futuresPosition.position} ${futuresPosition.leverage}x\n`;
      message += `Entry: $${futuresPosition.entry_price.toFixed(coin.current_price < 1 ? 6 : 2)}\n`;
      message += `Stop Loss: $${futuresPosition.stop_loss.toFixed(coin.current_price < 1 ? 6 : 2)}\n`;
      message += `Take Profit: $${futuresPosition.take_profit.toFixed(coin.current_price < 1 ? 6 : 2)}\n`;
      message += `Risk:Reward: ${futuresPosition.risk_reward_ratio}:1\n`;
    }

    // AI insight
    if (signal.aiInsight && signal.aiInsight !== 'AI analysis unavailable') {
      message += `\n🤖 *AI INSIGHT*\n${signal.aiInsight}\n`;
    }

    // Technical signals
    if (signal.reasoning.length > 0) {
      message += `\n📊 *SIGNALS*\n`;
      signal.reasoning.slice(0, 3).forEach((reason) => {
        message += `• ${reason}\n`;
      });
    }

    // Risk factors
    if (signal.riskFactors.length > 0) {
      message += `\n⚠️ *RISKS*\n`;
      signal.riskFactors.slice(0, 2).forEach((risk) => {
        message += `• ${risk}\n`;
      });
    }

    message += `\n━━━━━━━━━━━━━━━━\n`;
    message += `_Millitime Trading Signal_`;

    return message;
  }
}
