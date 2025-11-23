/**
 * Futures Trading Calculator
 * Calculates optimal leverage, entry points, stop loss, and take profit
 *
 * CRITICAL: Uses REAL chart levels (support/resistance), NOT arbitrary percentages!
 */

import { FuturesPosition } from '../types';
import { CandleData, TechnicalIndicatorValues } from './technicalIndicators';
import { SupportResistanceDetector, SwingPoints } from './supportResistance';

export interface FuturesCalculationParams {
  signalType: 'BUY' | 'SELL' | 'HOLD';
  currentPrice: number;
  technicalIndicators: TechnicalIndicatorValues;
  confidence: number; // 0-100
  volatility?: number; // ATR or volatility measure
  candles?: CandleData[]; // Required for real support/resistance detection
}

export class FuturesCalculator {
  /**
   * Calculate optimal futures position with risk management
   * Uses REAL support/resistance levels from chart, not formulas!
   */
  static calculatePosition(params: FuturesCalculationParams): FuturesPosition | null {
    const { signalType, currentPrice, technicalIndicators, confidence, volatility, candles } = params;

    if (signalType === 'HOLD') {
      return null; // No position for HOLD signals
    }

    // Skip low confidence trades (below 60% = not worth the risk)
    // 60%+ includes MODERATE signals which users want futures data for
    if (confidence < 60) {
      return null;
    }

    // Determine position direction
    const position: 'LONG' | 'SHORT' = signalType === 'BUY' ? 'LONG' : 'SHORT';

    // Calculate leverage based on confidence and volatility
    const leverage = this.calculateOptimalLeverage(confidence, volatility);
    if (leverage === 0) {
      return null; // Confidence too low
    }

    // Calculate entry price with small buffer for slippage
    const entry_price = this.calculateEntryPrice(currentPrice, position);

    // Find real support/resistance levels from chart
    let swingPoints: SwingPoints | null = null;
    if (candles && candles.length >= 20) {
      try {
        swingPoints = SupportResistanceDetector.findSwingPoints(candles, 20);
      } catch (error) {
        // Fall back to ATR-based calculation if swing detection fails
        swingPoints = null;
      }
    }

    // Calculate stop loss based on REAL chart levels (or ATR fallback)
    const stop_loss = this.calculateStopLoss(
      entry_price,
      position,
      technicalIndicators,
      leverage,
      swingPoints
    );

    // Calculate take profit based on REAL resistance/support levels
    const { take_profit, risk_reward_ratio } = this.calculateTakeProfit(
      entry_price,
      stop_loss,
      position,
      confidence,
      swingPoints
    );

    // Validate levels are sensible
    const validation = SupportResistanceDetector.validateLevels(
      entry_price,
      stop_loss,
      take_profit,
      position
    );

    if (!validation.isValid) {
      return null; // Invalid levels, skip this trade
    }

    return {
      position,
      leverage,
      entry_price,
      stop_loss,
      take_profit,
      risk_reward_ratio,
    };
  }

  /**
   * Calculate optimal leverage based on confidence and volatility
   * OPTIMIZED FOR 5-20% PROFIT TARGET PER TRADE
   *
   * Strategy:
   * - 0.5% price move × 10x leverage = 5% profit (after 1% fees = 4% net)
   * - 1.0% price move × 10x leverage = 10% profit (after 1% fees = 9% net)
   * - 2.0% price move × 10x leverage = 20% profit (after 1% fees = 19% net)
   *
   * Higher confidence = higher leverage (but capped for safety)
   * Higher volatility = lower leverage (prevents liquidation)
   */
  private static calculateOptimalLeverage(confidence: number, volatility?: number): number {
    // Base leverage on confidence - optimized for 15-min scalping with 0.5-1% targets
    let leverage: number;

    if (confidence >= 85) {
      leverage = 10; // Very high confidence: 0.5% move = 5% profit ✅
    } else if (confidence >= 80) {
      leverage = 7.5; // High confidence: 0.67% move = 5% profit
    } else if (confidence >= 75) {
      leverage = 5; // Medium-high: 1% move = 5% profit
    } else if (confidence >= 70) {
      leverage = 3; // Medium: 1.67% move = 5% profit
    } else if (confidence >= 60) {
      leverage = 3; // Moderate confidence: conservative leverage for info purposes
    } else {
      // Below 60% confidence: DON'T TRADE (not worth the risk)
      leverage = 0; // Will be filtered out by validation
    }

    // Reduce leverage if high volatility (prevents liquidation in choppy markets)
    if (volatility) {
      if (volatility > 5) {
        leverage = Math.max(2, leverage * 0.5); // Cut leverage in half for high volatility
      } else if (volatility > 3) {
        leverage = Math.max(2, leverage * 0.7); // Reduce leverage by 30%
      }
    }

    // Cap at reasonable max leverage for safety
    return Math.min(leverage, 10);
  }

  /**
   * Calculate entry price with small buffer for market orders
   */
  private static calculateEntryPrice(currentPrice: number, position: 'LONG' | 'SHORT'): number {
    // Add 0.1% slippage buffer
    const slippage = 0.001;

    if (position === 'LONG') {
      // For long, add slippage (buy slightly higher)
      return currentPrice * (1 + slippage);
    } else {
      // For short, subtract slippage (sell slightly lower)
      return currentPrice * (1 - slippage);
    }
  }

  /**
   * Calculate stop loss using REAL chart levels (swing lows/highs)
   * Falls back to ATR-based calculation if no swing data available
   *
   * CRITICAL FOR HIGH LEVERAGE: Tight stops prevent liquidation!
   * With 10x leverage: 1% adverse move = -10% loss on capital
   */
  private static calculateStopLoss(
    entryPrice: number,
    position: 'LONG' | 'SHORT',
    indicators: TechnicalIndicatorValues,
    leverage: number,
    swingPoints: SwingPoints | null
  ): number {
    // CRITICAL: Maximum stop loss based on leverage (prevents liquidation)
    let maxStopLossPercent: number;
    if (leverage >= 10) {
      maxStopLossPercent = 0.008; // 0.8% max for 10x leverage (8% capital risk)
    } else if (leverage >= 7) {
      maxStopLossPercent = 0.012; // 1.2% max for 7-10x leverage
    } else if (leverage >= 5) {
      maxStopLossPercent = 0.015; // 1.5% max for 5-7x leverage
    } else if (leverage >= 3) {
      maxStopLossPercent = 0.02; // 2% max for 3-5x leverage
    } else {
      maxStopLossPercent = 0.03; // 3% max for low leverage
    }

    let stopLoss: number;

    if (position === 'LONG') {
      // For LONG: Place stop below recent swing low (REAL chart level!)
      if (swingPoints && swingPoints.recentSwingLow < entryPrice) {
        const swingBasedStop = swingPoints.recentSwingLow * 0.999; // Slightly below swing low
        const stopDistance = (entryPrice - swingBasedStop) / entryPrice;

        // Use swing low ONLY if it's not too far (respects max stop loss)
        if (stopDistance <= maxStopLossPercent) {
          stopLoss = swingBasedStop;
        } else {
          // Swing low too far - use max stop loss instead
          stopLoss = entryPrice * (1 - maxStopLossPercent);
        }
      } else {
        // No swing data - fallback to ATR-based calculation
        const atr = indicators.atr || entryPrice * 0.015;
        const atrStop = entryPrice - (atr * 1.5);
        const minStopLoss = entryPrice * (1 - maxStopLossPercent);
        stopLoss = Math.max(atrStop, minStopLoss);
      }
    } else {
      // For SHORT: Place stop above recent swing high (REAL chart level!)
      if (swingPoints && swingPoints.recentSwingHigh > entryPrice) {
        const swingBasedStop = swingPoints.recentSwingHigh * 1.001; // Slightly above swing high
        const stopDistance = (swingBasedStop - entryPrice) / entryPrice;

        // Use swing high ONLY if it's not too far (respects max stop loss)
        if (stopDistance <= maxStopLossPercent) {
          stopLoss = swingBasedStop;
        } else {
          // Swing high too far - use max stop loss instead
          stopLoss = entryPrice * (1 + maxStopLossPercent);
        }
      } else {
        // No swing data - fallback to ATR-based calculation
        const atr = indicators.atr || entryPrice * 0.015;
        const atrStop = entryPrice + (atr * 1.5);
        const maxStopLoss = entryPrice * (1 + maxStopLossPercent);
        stopLoss = Math.min(atrStop, maxStopLoss);
      }
    }

    return stopLoss;
  }

  /**
   * Calculate take profit using REAL resistance/support levels
   * Falls back to risk/reward calculation if no level data available
   *
   * Strategy: Target nearest resistance (LONG) or support (SHORT)
   * - Uses actual chart levels, not formulas!
   * - Quick exits at real barriers = faster compound gains
   * - CRITICAL: Caps max TP distance to prevent unrealistic targets
   */
  private static calculateTakeProfit(
    entryPrice: number,
    stopLoss: number,
    position: 'LONG' | 'SHORT',
    confidence: number,
    swingPoints: SwingPoints | null
  ): { take_profit: number; risk_reward_ratio: number } {
    // Calculate risk distance
    const riskDistance = Math.abs(entryPrice - stopLoss);

    // CRITICAL: Maximum take profit distance (percentage from entry)
    // For scalping on 1H timeframe, targets beyond 5% are unrealistic
    // Max R:R capped at 5:1 to prevent using old historical highs/lows
    const maxTPPercent = 0.05; // 5% max move target
    const maxRiskReward = 5; // Max 5:1 R:R ratio
    const maxTPDistance = Math.min(
      entryPrice * maxTPPercent,
      riskDistance * maxRiskReward
    );

    let take_profit: number;

    if (position === 'LONG') {
      // For LONG: Target nearest resistance level (REAL chart level!)
      if (swingPoints && swingPoints.nextResistance > entryPrice) {
        const resistanceTarget = swingPoints.nextResistance * 0.999; // Slightly below resistance
        const profitDistance = resistanceTarget - entryPrice;

        // Use resistance level if it gives at least 1:1 risk/reward
        // AND is not too far away (prevents using old historical highs)
        if (profitDistance >= riskDistance && profitDistance <= maxTPDistance) {
          take_profit = resistanceTarget;
        } else if (profitDistance > maxTPDistance) {
          // Resistance too far - cap at max TP distance
          take_profit = entryPrice + maxTPDistance;
        } else {
          // Resistance too close - use minimum risk/reward instead
          take_profit = entryPrice + (riskDistance * 1.5);
        }
      } else {
        // No resistance data - fallback to risk/reward calculation
        const targetRR = confidence >= 85 ? 2.5 : confidence >= 80 ? 2 : 1.5;
        take_profit = entryPrice + (riskDistance * Math.min(targetRR, maxRiskReward));
      }
    } else {
      // For SHORT: Target nearest support level (REAL chart level!)
      if (swingPoints && swingPoints.nextSupport < entryPrice) {
        const supportTarget = swingPoints.nextSupport * 1.001; // Slightly above support
        const profitDistance = entryPrice - supportTarget;

        // Use support level if it gives at least 1:1 risk/reward
        // AND is not too far away (prevents using old historical lows)
        if (profitDistance >= riskDistance && profitDistance <= maxTPDistance) {
          take_profit = supportTarget;
        } else if (profitDistance > maxTPDistance) {
          // Support too far - cap at max TP distance
          take_profit = entryPrice - maxTPDistance;
        } else {
          // Support too close - use minimum risk/reward instead
          take_profit = entryPrice - (riskDistance * 1.5);
        }
      } else {
        // No support data - fallback to risk/reward calculation
        const targetRR = confidence >= 85 ? 2.5 : confidence >= 80 ? 2 : 1.5;
        take_profit = entryPrice - (riskDistance * Math.min(targetRR, maxRiskReward));
      }
    }

    // Calculate actual risk/reward ratio achieved
    const profitDistance = Math.abs(take_profit - entryPrice);
    const risk_reward_ratio = profitDistance / riskDistance;

    return {
      take_profit,
      risk_reward_ratio,
    };
  }

  /**
   * Calculate position size based on account balance and risk percentage
   */
  static calculatePositionSize(
    accountBalance: number,
    entryPrice: number,
    stopLoss: number,
    leverage: number,
    riskPercentage: number = 1 // Default 1% risk per trade
  ): number {
    const riskAmount = accountBalance * (riskPercentage / 100);
    const stopLossDistance = Math.abs(entryPrice - stopLoss);
    const stopLossPercent = stopLossDistance / entryPrice;

    // Position size considering leverage
    const positionSize = riskAmount / (stopLossPercent * leverage);

    return positionSize;
  }

  /**
   * Validate if a futures position is safe and reasonable
   */
  static validatePosition(position: FuturesPosition, currentPrice: number): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let isValid = true;

    // Check leverage is reasonable
    if (position.leverage > 20) {
      warnings.push('Leverage exceeds recommended maximum (20x)');
      isValid = false;
    }

    // Check stop loss is set
    if (!position.stop_loss || position.stop_loss === 0) {
      warnings.push('Stop loss must be set');
      isValid = false;
    }

    // Check entry price is reasonable
    const priceDiff = Math.abs(position.entry_price - currentPrice) / currentPrice;
    if (priceDiff > 0.05) {
      warnings.push('Entry price is more than 5% away from current price');
    }

    // Check stop loss distance is reasonable
    const stopLossDistance = Math.abs(position.entry_price - position.stop_loss) / position.entry_price;
    if (stopLossDistance > 0.1) {
      warnings.push('Stop loss is more than 10% away from entry');
    }
    if (stopLossDistance < 0.005) {
      warnings.push('Stop loss is too tight (less than 0.5%)');
    }

    // Check take profit is beyond entry
    if (position.position === 'LONG') {
      if (position.take_profit <= position.entry_price) {
        warnings.push('Take profit must be above entry price for LONG position');
        isValid = false;
      }
      if (position.stop_loss >= position.entry_price) {
        warnings.push('Stop loss must be below entry price for LONG position');
        isValid = false;
      }
    } else {
      if (position.take_profit >= position.entry_price) {
        warnings.push('Take profit must be below entry price for SHORT position');
        isValid = false;
      }
      if (position.stop_loss <= position.entry_price) {
        warnings.push('Stop loss must be above entry price for SHORT position');
        isValid = false;
      }
    }

    // Check risk/reward ratio is positive
    if (position.risk_reward_ratio < 1) {
      warnings.push('Risk/reward ratio should be at least 1:1');
    }

    return { isValid, warnings };
  }
}
