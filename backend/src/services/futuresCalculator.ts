/**
 * Futures Trading Calculator
 * Calculates optimal leverage, entry points, stop loss, and take profit for futures trading
 */

import { FuturesPosition } from '../types';
import { TechnicalIndicatorValues } from './technicalIndicators';

export interface FuturesCalculationParams {
  signalType: 'BUY' | 'SELL' | 'HOLD';
  currentPrice: number;
  technicalIndicators: TechnicalIndicatorValues;
  confidence: number; // 0-100
  volatility?: number; // ATR or volatility measure
}

export class FuturesCalculator {
  /**
   * Calculate optimal futures position with risk management
   */
  static calculatePosition(params: FuturesCalculationParams): FuturesPosition | null {
    const { signalType, currentPrice, technicalIndicators, confidence, volatility } = params;

    if (signalType === 'HOLD') {
      return null; // No position for HOLD signals
    }

    // Determine position direction
    const position: 'LONG' | 'SHORT' = signalType === 'BUY' ? 'LONG' : 'SHORT';

    // Calculate leverage based on confidence and volatility
    const leverage = this.calculateOptimalLeverage(confidence, volatility);

    // Calculate entry price with small buffer for slippage
    const entry_price = this.calculateEntryPrice(currentPrice, position);

    // Calculate stop loss based on ATR and support/resistance
    const stop_loss = this.calculateStopLoss(
      entry_price,
      position,
      technicalIndicators,
      leverage
    );

    // Calculate take profit with optimal risk/reward ratio
    const { take_profit, risk_reward_ratio } = this.calculateTakeProfit(
      entry_price,
      stop_loss,
      position,
      confidence
    );

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
   * Higher confidence = higher leverage (but capped for safety)
   * Higher volatility = lower leverage
   */
  private static calculateOptimalLeverage(confidence: number, volatility?: number): number {
    // Base leverage on confidence
    let leverage: number;

    if (confidence >= 85) {
      leverage = 10; // Very high confidence
    } else if (confidence >= 75) {
      leverage = 7.5; // High confidence
    } else if (confidence >= 65) {
      leverage = 5; // Moderate-high confidence
    } else if (confidence >= 55) {
      leverage = 3; // Moderate confidence
    } else {
      leverage = 2; // Lower confidence
    }

    // Reduce leverage if high volatility
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
   * Calculate stop loss based on ATR and technical levels
   * Uses ATR for volatility-adjusted stop loss
   */
  private static calculateStopLoss(
    entryPrice: number,
    position: 'LONG' | 'SHORT',
    indicators: TechnicalIndicatorValues,
    leverage: number
  ): number {
    // Use ATR for stop loss distance (more conservative with higher leverage)
    const atr = indicators.atr || entryPrice * 0.02; // Default to 2% if no ATR

    // Stop loss distance decreases with leverage to manage risk
    const stopLossMultiplier = Math.max(1.5, 3 - (leverage / 10)); // 1.5x to 3x ATR
    const stopLossDistance = atr * stopLossMultiplier;

    // Also consider support/resistance levels
    let stopLoss: number;

    if (position === 'LONG') {
      // For long, stop loss below entry
      // Use the lower of: recent low or ATR-based stop
      const atrStop = entryPrice - stopLossDistance;
      stopLoss = atrStop;

      // Make sure stop loss is reasonable (not more than 5% for high leverage)
      const maxStopLossPercent = leverage >= 5 ? 0.03 : 0.05;
      const minStopLoss = entryPrice * (1 - maxStopLossPercent);
      stopLoss = Math.max(stopLoss, minStopLoss);
    } else {
      // For short, stop loss above entry
      const atrStop = entryPrice + stopLossDistance;
      stopLoss = atrStop;

      const maxStopLossPercent = leverage >= 5 ? 0.03 : 0.05;
      const maxStopLoss = entryPrice * (1 + maxStopLossPercent);
      stopLoss = Math.min(stopLoss, maxStopLoss);
    }

    return stopLoss;
  }

  /**
   * Calculate take profit based on risk/reward ratio
   * Higher confidence = higher R:R target
   */
  private static calculateTakeProfit(
    entryPrice: number,
    stopLoss: number,
    position: 'LONG' | 'SHORT',
    confidence: number
  ): { take_profit: number; risk_reward_ratio: number } {
    // Calculate risk distance
    const riskDistance = Math.abs(entryPrice - stopLoss);

    // Risk/reward ratio based on confidence
    let riskRewardRatio: number;
    if (confidence >= 80) {
      riskRewardRatio = 3; // 1:3 risk/reward
    } else if (confidence >= 70) {
      riskRewardRatio = 2.5; // 1:2.5
    } else if (confidence >= 60) {
      riskRewardRatio = 2; // 1:2
    } else {
      riskRewardRatio = 1.5; // 1:1.5
    }

    const rewardDistance = riskDistance * riskRewardRatio;

    let take_profit: number;
    if (position === 'LONG') {
      take_profit = entryPrice + rewardDistance;
    } else {
      take_profit = entryPrice - rewardDistance;
    }

    return {
      take_profit,
      risk_reward_ratio: riskRewardRatio,
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
