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

    if (candles.length < 50) {
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
          // Calculate position size
          const futuresParams = useFutures
            ? FuturesCalculator.calculatePosition({
                signalType: signal.type,
                currentPrice: currentCandle.close,
                technicalIndicators: signal.technicalIndicators,
                confidence: signal.confidence,
                volatility: signal.technicalIndicators.atr,
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
            entryTime: currentCandle.timestamp,
            exitTime: currentCandle.timestamp, // Will be updated on exit
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
   */
  private async fetchHistoricalCandles(
    coinId: string,
    coinSymbol: string,
    startDate: Date,
    endDate: Date
  ) {
    // Use the existing candle data fetcher
    // For backtesting, we need hourly or 4h candles for longer periods
    return await candleDataFetcher.fetch15MinCandles(coinId, coinSymbol, 1000);
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
        this.fastify.log.error('AI signal generation failed in backtest:', error);
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
