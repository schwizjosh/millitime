/**
 * Backtesting Engine
 * Tests trading strategies against historical data to validate reliability
 */

import { FastifyInstance } from 'fastify';
import { candleDataFetcher } from './candleDataFetcher';
import { technicalIndicatorService } from './technicalIndicators';
import { AITradingStrategyService, EnhancedSignal } from './aiTradingStrategy';
import { FuturesCalculator } from './futuresCalculator';
import { Backtest } from '../types';

export interface BacktestParams {
  coinId: string;
  coinSymbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  riskPercentage?: number; // Percentage of balance to risk per trade (default 1%)
  useAI?: boolean;
  useFutures?: boolean;
  strategyParams?: Record<string, any>;
}

export interface BacktestTrade {
  entryTime: Date;
  exitTime: Date;
  signal: 'BUY' | 'SELL';
  position?: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
  exitReason: 'take_profit' | 'stop_loss' | 'signal_reverse' | 'end_of_period';
  profitLoss: number;
  profitLossPercentage: number;
  balanceAfter: number;
}

export interface BacktestResult {
  coinId: string;
  coinSymbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  finalBalance: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfitLoss: number;
  profitLossPercentage: number;
  maxDrawdown: number;
  sharpeRatio: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  trades: BacktestTrade[];
}

export class BacktestingEngine {
  private fastify: FastifyInstance;
  private aiStrategy: AITradingStrategyService | null = null;

  constructor(fastify: FastifyInstance, aiStrategy?: AITradingStrategyService) {
    this.fastify = fastify;
    this.aiStrategy = aiStrategy || null;
  }

  /**
   * Run backtest on historical data
   */
  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    const {
      coinId,
      coinSymbol,
      startDate,
      endDate,
      initialBalance,
      riskPercentage = 1,
      useAI = false,
      useFutures = false,
    } = params;

    // Fetch historical candle data
    const candles = await this.fetchHistoricalCandles(coinId, coinSymbol, startDate, endDate);

    if (!candles || candles.length < 50) {
      throw new Error('Insufficient historical data for backtesting');
    }

    this.fastify.log.info(
      `Running backtest for ${coinSymbol} from ${startDate.toISOString()} to ${endDate.toISOString()} with ${candles.length} candles`
    );

    // Run simulation
    const trades: BacktestTrade[] = [];
    let balance = initialBalance;
    let peakBalance = initialBalance;
    let maxDrawdown = 0;
    let currentPosition: BacktestTrade | null = null;

    // Process candles in chronological order
    for (let i = 50; i < candles.length; i++) {
      const currentCandle = candles[i];
      const historicalCandles = candles.slice(Math.max(0, i - 100), i);

      // Check if we need to exit current position
      if (currentPosition) {
        const exitCheck = this.checkExit(currentPosition, currentCandle);
        if (exitCheck) {
          const exitedTrade = this.exitPosition(currentPosition, currentCandle, exitCheck.reason);
          balance = exitedTrade.balanceAfter;
          trades.push(exitedTrade);
          currentPosition = null;

          // Update drawdown
          if (balance > peakBalance) {
            peakBalance = balance;
          }
          const drawdown = ((peakBalance - balance) / peakBalance) * 100;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
      }

      // Generate signal if no position
      if (!currentPosition) {
        const signal = await this.generateBacktestSignal(
          coinId,
          coinSymbol,
          currentCandle.close,
          historicalCandles,
          useAI
        );

        if (signal && (signal.type === 'BUY' || signal.type === 'SELL')) {
          // Calculate position size using REAL chart levels
          const futuresParams = useFutures
            ? FuturesCalculator.calculatePosition({
                signalType: signal.type,
                currentPrice: currentCandle.close,
                technicalIndicators: signal.technicalIndicators,
                confidence: signal.confidence,
                volatility: signal.technicalIndicators.atr,
                candles: historicalCandles, // Pass candles for real support/resistance
              })
            : null;

          const positionSize = this.calculatePositionSize(
            balance,
            currentCandle.close,
            futuresParams?.stop_loss || currentCandle.close * 0.95,
            futuresParams?.leverage || 1,
            riskPercentage
          );

          currentPosition = {
            entryTime: new Date(currentCandle.timestamp || currentCandle.time),
            exitTime: new Date(currentCandle.timestamp || currentCandle.time), // Will be updated on exit
            signal: signal.type,
            position: futuresParams?.position,
            entryPrice: futuresParams?.entry_price || currentCandle.close,
            exitPrice: 0, // Will be set on exit
            leverage: futuresParams?.leverage,
            stopLoss: futuresParams?.stop_loss,
            takeProfit: futuresParams?.take_profit,
            exitReason: 'end_of_period',
            profitLoss: 0,
            profitLossPercentage: 0,
            balanceAfter: balance,
          };
        }
      }
    }

    // Close any open position at end
    if (currentPosition) {
      const lastCandle = candles[candles.length - 1];
      const exitedTrade = this.exitPosition(currentPosition, lastCandle, 'end_of_period');
      balance = exitedTrade.balanceAfter;
      trades.push(exitedTrade);
    }

    // Calculate statistics
    const winningTrades = trades.filter((t) => t.profitLoss > 0);
    const losingTrades = trades.filter((t) => t.profitLoss < 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const totalProfitLoss = balance - initialBalance;
    const profitLossPercentage = ((totalProfitLoss / initialBalance) * 100);

    const averageWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.profitLoss, 0) / winningTrades.length
        : 0;
    const averageLoss =
      losingTrades.length > 0
        ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profitLoss, 0) / losingTrades.length)
        : 0;

    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.profitLoss)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.profitLoss)) : 0;

    const sharpeRatio = this.calculateSharpeRatio(trades, initialBalance);

    return {
      coinId,
      coinSymbol,
      startDate,
      endDate,
      initialBalance,
      finalBalance: balance,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalProfitLoss,
      profitLossPercentage,
      maxDrawdown,
      sharpeRatio,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      trades,
    };
  }

  /**
   * Fetch historical candle data for backtesting
   * Automatically selects appropriate timeframe based on date range
   * Includes extra candles for indicator warm-up (RSI, MACD, EMAs need history)
   */
  private async fetchHistoricalCandles(
    coinId: string,
    coinSymbol: string,
    startDate: Date,
    endDate: Date
  ) {
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    this.fastify.log.info(`Fetching ${daysDiff} days of historical data for ${coinSymbol}`);

    // IMPORTANT: Add 100 candles for indicator warm-up
    // Technical indicators need history to calculate properly:
    // - RSI: 14 periods
    // - MACD: 26 periods
    // - EMA 50: 50 periods
    // - We use 100 to be safe for all indicators

    // Choose appropriate timeframe based on span
    if (daysDiff > 180) {
      // For 6+ months, use daily candles (most reliable for long-term backtests)
      const limit = Math.min(daysDiff + 100, 2000); // +100 for indicator warm-up
      this.fastify.log.info(`Using DAILY candles (${limit} candles for ${daysDiff}-day backtest)`);
      return await candleDataFetcher.fetchDailyCandles(coinId, coinSymbol, limit);
    } else if (daysDiff > 30) {
      // For 1-6 months, use 4H candles (good balance)
      const limit = Math.min((daysDiff * 6) + 100, 2000); // +100 for warm-up
      this.fastify.log.info(`Using 4H candles (${limit} candles for ${daysDiff}-day backtest)`);
      return await candleDataFetcher.fetch4HourCandles(coinId, coinSymbol, limit);
    } else if (daysDiff > 3) {
      // For 3-30 days, use 1H candles (matches live trading strategy)
      const limit = Math.min((daysDiff * 24) + 100, 2000); // +100 for warm-up
      this.fastify.log.info(`Using 1H candles (${limit} candles for ${daysDiff}-day backtest)`);
      return await candleDataFetcher.fetch1HourCandles(coinId, coinSymbol, limit);
    } else {
      // For < 3 days, use 15min candles (high granularity)
      const limit = Math.min((daysDiff * 96) + 100, 2000); // +100 for warm-up
      this.fastify.log.info(`Using 15MIN candles (${limit} candles for ${daysDiff}-day backtest)`);
      return await candleDataFetcher.fetch15MinCandles(coinId, coinSymbol, limit);
    }
  }

  /**
   * Generate signal for backtesting
   */
  private async generateBacktestSignal(
    coinId: string,
    coinSymbol: string,
    currentPrice: number,
    candles: any[],
    useAI: boolean
  ): Promise<EnhancedSignal | null> {
    if (useAI && this.aiStrategy) {
      try {
        return await this.aiStrategy.generateEnhancedSignal(
          coinId,
          coinSymbol,
          currentPrice,
          candles,
          { includeAI: true, includeFundamental: false } // Skip FA for speed
        );
      } catch (error) {
        this.fastify.log.error({ error }, 'AI signal generation failed in backtest');
      }
    }

    // Fallback to technical only
    const technicalSignal = technicalIndicatorService.generateConfluenceSignal(candles);
    if (!technicalSignal || technicalSignal.confidence < 50) {
      return null;
    }

    return {
      type: technicalSignal.type,
      strength: technicalSignal.strength,
      confidence: technicalSignal.confidence,
      technicalScore: technicalSignal.confidence,
      technicalConfluence: technicalSignal.confidence,
      technicalIndicators: technicalSignal.indicators,
      fundamentalScore: 50,
      fundamentalRecommendation: 'N/A',
      aiInsight: 'Backtest mode',
      aiRecommendation: 'HOLD',
      aiUsed: false,
      overallScore: technicalSignal.confidence,
      reasoning: technicalSignal.signals || [],
      riskFactors: [],
      provider: 'backtest',
      tokensUsed: 0,
    };
  }

  /**
   * Check if position should be exited
   */
  private checkExit(
    position: BacktestTrade,
    currentCandle: any
  ): { reason: 'take_profit' | 'stop_loss' | 'signal_reverse' } | null {
    const currentPrice = currentCandle.close;

    // Check stop loss
    if (position.stopLoss) {
      if (position.position === 'LONG' && currentPrice <= position.stopLoss) {
        return { reason: 'stop_loss' };
      }
      if (position.position === 'SHORT' && currentPrice >= position.stopLoss) {
        return { reason: 'stop_loss' };
      }
    }

    // Check take profit
    if (position.takeProfit) {
      if (position.position === 'LONG' && currentPrice >= position.takeProfit) {
        return { reason: 'take_profit' };
      }
      if (position.position === 'SHORT' && currentPrice <= position.takeProfit) {
        return { reason: 'take_profit' };
      }
    }

    return null;
  }

  /**
   * Exit position and calculate P&L
   */
  private exitPosition(
    position: BacktestTrade,
    currentCandle: any,
    exitReason: BacktestTrade['exitReason']
  ): BacktestTrade {
    const exitPrice = currentCandle.close;
    const leverage = position.leverage || 1;

    let profitLossPercentage: number;
    if (position.position === 'LONG' || position.signal === 'BUY') {
      profitLossPercentage = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 * leverage;
    } else {
      profitLossPercentage = ((position.entryPrice - exitPrice) / position.entryPrice) * 100 * leverage;
    }

    const profitLoss = (position.balanceAfter * profitLossPercentage) / 100;
    const balanceAfter = position.balanceAfter + profitLoss;

    return {
      ...position,
      exitTime: currentCandle.timestamp,
      exitPrice,
      exitReason,
      profitLoss,
      profitLossPercentage,
      balanceAfter,
    };
  }

  /**
   * Calculate position size based on risk management
   */
  private calculatePositionSize(
    balance: number,
    entryPrice: number,
    stopLoss: number,
    leverage: number,
    riskPercentage: number
  ): number {
    return FuturesCalculator.calculatePositionSize(
      balance,
      entryPrice,
      stopLoss,
      leverage,
      riskPercentage
    );
  }

  /**
   * Calculate Sharpe Ratio (risk-adjusted returns)
   */
  private calculateSharpeRatio(trades: BacktestTrade[], initialBalance: number): number {
    if (trades.length < 2) {
      return 0;
    }

    const returns = trades.map((t) => t.profitLossPercentage);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    if (stdDev === 0) {
      return 0;
    }

    // Annualized Sharpe Ratio (assuming 365 trading days)
    const sharpe = (avgReturn / stdDev) * Math.sqrt(365);
    return sharpe;
  }

  /**
   * Run rolling window backtest (Option C - Most Accurate)
   * Breaks a long period into smaller windows and aggregates results
   * Perfect for backtesting 5+ years while using 1H candles
   *
   * @param params - Backtest parameters
   * @param windowDays - Size of each window in days (default: 30)
   * @param windowStepDays - Days to step forward for next window (default: 30, no overlap)
   */
  async runRollingWindowBacktest(
    params: BacktestParams,
    windowDays: number = 30,
    windowStepDays: number = 30
  ): Promise<{
    aggregatedResult: BacktestResult;
    windowResults: BacktestResult[];
  }> {
    const { coinId, coinSymbol, startDate, endDate, initialBalance } = params;

    this.fastify.log.info(
      `Starting rolling window backtest for ${coinSymbol}: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
    );
    this.fastify.log.info(`Window size: ${windowDays} days, Step: ${windowStepDays} days`);

    const windowResults: BacktestResult[] = [];
    let currentStart = new Date(startDate);
    const totalEnd = new Date(endDate);
    let windowNumber = 1;
    let cumulativeBalance = initialBalance;

    // Run backtests in rolling windows
    while (currentStart < totalEnd) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + windowDays);

      // Don't exceed final end date
      if (currentEnd > totalEnd) {
        currentEnd.setTime(totalEnd.getTime());
      }

      this.fastify.log.info(
        `\n📊 Window #${windowNumber}: ${currentStart.toISOString().split('T')[0]} to ${currentEnd.toISOString().split('T')[0]}`
      );

      try {
        // Run backtest for this window using cumulative balance
        const windowResult = await this.runBacktest({
          ...params,
          startDate: currentStart,
          endDate: currentEnd,
          initialBalance: cumulativeBalance, // Use ending balance from previous window
        });

        windowResults.push(windowResult);

        // Update cumulative balance for next window
        cumulativeBalance = windowResult.finalBalance;

        this.fastify.log.info(
          `✅ Window #${windowNumber}: ${windowResult.totalTrades} trades, ` +
          `Win rate: ${windowResult.winRate.toFixed(1)}%, ` +
          `P&L: ${windowResult.profitLossPercentage.toFixed(2)}%, ` +
          `Balance: $${cumulativeBalance.toFixed(2)}`
        );
      } catch (error: any) {
        this.fastify.log.error(
          `❌ Window #${windowNumber} failed: ${error.message}`
        );
        // Continue with next window even if one fails
      }

      // Move to next window
      currentStart = new Date(currentStart);
      currentStart.setDate(currentStart.getDate() + windowStepDays);
      windowNumber++;
    }

    // Aggregate all trades across windows
    const allTrades: BacktestTrade[] = [];
    windowResults.forEach((result) => {
      allTrades.push(...result.trades);
    });

    // Calculate aggregate statistics
    const winningTrades = allTrades.filter((t) => t.profitLoss > 0);
    const losingTrades = allTrades.filter((t) => t.profitLoss < 0);
    const winRate = allTrades.length > 0 ? (winningTrades.length / allTrades.length) * 100 : 0;
    const totalProfitLoss = cumulativeBalance - initialBalance;
    const profitLossPercentage = ((totalProfitLoss / initialBalance) * 100);

    const averageWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.profitLoss, 0) / winningTrades.length
        : 0;
    const averageLoss =
      losingTrades.length > 0
        ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profitLoss, 0) / losingTrades.length)
        : 0;

    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.profitLoss)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.profitLoss)) : 0;

    // Calculate max drawdown across all windows
    let peakBalance = initialBalance;
    let maxDrawdown = 0;
    windowResults.forEach((result) => {
      if (result.finalBalance > peakBalance) {
        peakBalance = result.finalBalance;
      }
      const drawdown = ((peakBalance - result.finalBalance) / peakBalance) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    const sharpeRatio = this.calculateSharpeRatio(allTrades, initialBalance);

    const aggregatedResult: BacktestResult = {
      coinId,
      coinSymbol,
      startDate,
      endDate,
      initialBalance,
      finalBalance: cumulativeBalance,
      totalTrades: allTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalProfitLoss,
      profitLossPercentage,
      maxDrawdown,
      sharpeRatio,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      trades: allTrades,
    };

    this.fastify.log.info('\n' + '='.repeat(80));
    this.fastify.log.info('📈 ROLLING WINDOW BACKTEST COMPLETE');
    this.fastify.log.info('='.repeat(80));
    this.fastify.log.info(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    this.fastify.log.info(`Windows completed: ${windowResults.length}`);
    this.fastify.log.info(`Total trades: ${allTrades.length}`);
    this.fastify.log.info(`Win rate: ${winRate.toFixed(2)}%`);
    this.fastify.log.info(`Total P&L: $${totalProfitLoss.toFixed(2)} (${profitLossPercentage.toFixed(2)}%)`);
    this.fastify.log.info(`Initial: $${initialBalance} → Final: $${cumulativeBalance.toFixed(2)}`);
    this.fastify.log.info(`Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
    this.fastify.log.info(`Sharpe Ratio: ${sharpeRatio.toFixed(2)}`);
    this.fastify.log.info('='.repeat(80));

    return {
      aggregatedResult,
      windowResults,
    };
  }

  /**
   * Save backtest results to database
   */
  async saveBacktest(userId: number, result: BacktestResult): Promise<number> {
    const client = await this.fastify.pg.connect();

    try {
      const insertResult = await client.query<{ id: number }>(
        `INSERT INTO backtests
         (user_id, coin_id, coin_symbol, start_date, end_date, initial_balance, final_balance,
          total_trades, winning_trades, losing_trades, win_rate, total_profit_loss,
          profit_loss_percentage, max_drawdown, sharpe_ratio, trade_history)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          userId,
          result.coinId,
          result.coinSymbol,
          result.startDate,
          result.endDate,
          result.initialBalance,
          result.finalBalance,
          result.totalTrades,
          result.winningTrades,
          result.losingTrades,
          result.winRate,
          result.totalProfitLoss,
          result.profitLossPercentage,
          result.maxDrawdown,
          result.sharpeRatio,
          JSON.stringify({
            trades: result.trades.slice(0, 100), // Store first 100 trades
            averageWin: result.averageWin,
            averageLoss: result.averageLoss,
            largestWin: result.largestWin,
            largestLoss: result.largestLoss,
          }),
        ]
      );

      return insertResult.rows[0].id;
    } finally {
      client.release();
    }
  }
}
