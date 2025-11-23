/**
 * Support & Resistance Detector
 * Finds REAL chart levels for stop loss and take profit placement
 * NO arbitrary percentages - uses actual price action!
 */

import { CandleData } from './technicalIndicators';

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // 1-10, higher = stronger level
  touches: number; // How many times price tested this level
}

export interface SwingPoints {
  recentSwingLow: number; // For LONG stop loss
  recentSwingHigh: number; // For SHORT stop loss / LONG take profit
  nextResistance: number; // For LONG take profit
  nextSupport: number; // For SHORT take profit
  keyLevels: SupportResistanceLevel[];
}

export class SupportResistanceDetector {
  /**
   * Find swing points and key levels from recent candles
   * Used for REAL stop loss and take profit placement
   *
   * CRITICAL: Only finds LOCAL levels within reasonable range of current price
   * Prevents using old historical highs/lows from when coin was at different price
   */
  static findSwingPoints(candles: CandleData[], lookback: number = 20): SwingPoints {
    if (candles.length < lookback) {
      throw new Error(`Need at least ${lookback} candles for support/resistance detection`);
    }

    const recentCandles = candles.slice(-lookback);
    const currentPrice = candles[candles.length - 1].close;

    // Maximum distance from current price to consider a level "local"
    // For 1H scalping, levels beyond 10% are not relevant
    const maxLevelDistance = currentPrice * 0.10; // 10% range

    // Find swing lows and highs from recent candles only
    const swingLows = this.findSwingLows(recentCandles);
    const swingHighs = this.findSwingHighs(recentCandles);

    // Filter to only LOCAL swing points (within range of current price)
    const localSwingLows = swingLows.filter(
      level => Math.abs(level - currentPrice) <= maxLevelDistance
    );
    const localSwingHighs = swingHighs.filter(
      level => Math.abs(level - currentPrice) <= maxLevelDistance
    );

    // Find nearest swing low below current price (for LONG stop loss)
    const recentSwingLow = this.findNearestLevelBelow(currentPrice, localSwingLows) ||
      Math.min(...recentCandles.map(c => c.low));

    // Find nearest swing high above current price (for LONG take profit)
    const recentSwingHigh = this.findNearestLevelAbove(currentPrice, localSwingHighs) ||
      Math.max(...recentCandles.map(c => c.high));

    // Detect resistance levels - only use recent candles to avoid old historical levels
    const resistanceLevels = this.detectKeyLevels(recentCandles, 'resistance', currentPrice, maxLevelDistance);
    const nextResistance = this.findNearestLevelAbove(currentPrice,
      resistanceLevels.map(l => l.price)) || recentSwingHigh;

    // Detect support levels - only use recent candles to avoid old historical levels
    const supportLevels = this.detectKeyLevels(recentCandles, 'support', currentPrice, maxLevelDistance);
    const nextSupport = this.findNearestLevelBelow(currentPrice,
      supportLevels.map(l => l.price)) || recentSwingLow;

    return {
      recentSwingLow,
      recentSwingHigh,
      nextResistance,
      nextSupport,
      keyLevels: [...supportLevels, ...resistanceLevels],
    };
  }

  /**
   * Find swing lows - local minimums where price bounced up
   * A swing low is when: candle[i-1].low > candle[i].low < candle[i+1].low
   */
  private static findSwingLows(candles: CandleData[]): number[] {
    const swingLows: number[] = [];

    for (let i = 2; i < candles.length - 2; i++) {
      const prev2 = candles[i - 2].low;
      const prev1 = candles[i - 1].low;
      const current = candles[i].low;
      const next1 = candles[i + 1].low;
      const next2 = candles[i + 2].low;

      // Swing low: current is lower than surrounding candles
      if (
        current < prev2 &&
        current < prev1 &&
        current < next1 &&
        current < next2
      ) {
        swingLows.push(current);
      }
    }

    return swingLows;
  }

  /**
   * Find swing highs - local maximums where price rejected down
   * A swing high is when: candle[i-1].high < candle[i].high > candle[i+1].high
   */
  private static findSwingHighs(candles: CandleData[]): number[] {
    const swingHighs: number[] = [];

    for (let i = 2; i < candles.length - 2; i++) {
      const prev2 = candles[i - 2].high;
      const prev1 = candles[i - 1].high;
      const current = candles[i].high;
      const next1 = candles[i + 1].high;
      const next2 = candles[i + 2].high;

      // Swing high: current is higher than surrounding candles
      if (
        current > prev2 &&
        current > prev1 &&
        current > next1 &&
        current > next2
      ) {
        swingHighs.push(current);
      }
    }

    return swingHighs;
  }

  /**
   * Detect key support/resistance levels with clustering
   * Groups nearby levels (within 0.5%) and counts touches
   * Only includes levels within maxDistance of currentPrice (LOCAL levels)
   */
  private static detectKeyLevels(
    candles: CandleData[],
    type: 'support' | 'resistance',
    currentPrice?: number,
    maxDistance?: number
  ): SupportResistanceLevel[] {
    const levels: Map<number, SupportResistanceLevel> = new Map();
    const tolerance = 0.005; // 0.5% tolerance for level clustering

    // Extract relevant prices
    const prices = type === 'support'
      ? candles.map(c => c.low)
      : candles.map(c => c.high);

    // Find levels where price repeatedly tested
    for (let i = 0; i < prices.length; i++) {
      const price = prices[i];

      // Skip prices outside local range if filtering enabled
      if (currentPrice && maxDistance) {
        if (Math.abs(price - currentPrice) > maxDistance) {
          continue; // Price too far from current - not a local level
        }
      }

      let foundCluster = false;

      // Check if this price clusters with an existing level
      for (const [levelPrice, level] of levels.entries()) {
        if (Math.abs(price - levelPrice) / levelPrice < tolerance) {
          // Update existing level
          level.touches++;
          level.strength = Math.min(10, level.touches * 2);
          foundCluster = true;
          break;
        }
      }

      // Create new level if no cluster found
      if (!foundCluster) {
        levels.set(price, {
          price,
          type,
          strength: 1,
          touches: 1,
        });
      }
    }

    // Filter to only strong levels (touched 2+ times for local levels)
    // Reduced from 3 to 2 since we're working with fewer candles now
    const minTouches = (currentPrice && maxDistance) ? 2 : 3;

    return Array.from(levels.values())
      .filter(level => level.touches >= minTouches)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // Top 5 strongest levels
  }

  /**
   * Find nearest level above given price
   */
  private static findNearestLevelAbove(price: number, levels: number[]): number | null {
    const above = levels.filter(l => l > price).sort((a, b) => a - b);
    return above.length > 0 ? above[0] : null;
  }

  /**
   * Find nearest level below given price
   */
  private static findNearestLevelBelow(price: number, levels: number[]): number | null {
    const below = levels.filter(l => l < price).sort((a, b) => b - a);
    return below.length > 0 ? below[0] : null;
  }

  /**
   * Calculate distance from price to nearest support/resistance
   * Returns percentage distance
   */
  static getDistanceToLevel(
    currentPrice: number,
    targetLevel: number
  ): { distance: number; percentage: number } {
    const distance = Math.abs(targetLevel - currentPrice);
    const percentage = (distance / currentPrice) * 100;

    return { distance, percentage };
  }

  /**
   * Validate if stop loss / take profit levels are reasonable
   */
  static validateLevels(
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    position: 'LONG' | 'SHORT'
  ): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let isValid = true;

    const stopDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
    const profitDistance = Math.abs(takeProfit - entryPrice) / entryPrice;

    if (position === 'LONG') {
      if (stopLoss >= entryPrice) {
        warnings.push('LONG stop loss must be BELOW entry price');
        isValid = false;
      }
      if (takeProfit <= entryPrice) {
        warnings.push('LONG take profit must be ABOVE entry price');
        isValid = false;
      }
    } else {
      if (stopLoss <= entryPrice) {
        warnings.push('SHORT stop loss must be ABOVE entry price');
        isValid = false;
      }
      if (takeProfit >= entryPrice) {
        warnings.push('SHORT take profit must be BELOW entry price');
        isValid = false;
      }
    }

    // Warn if stop is too wide
    if (stopDistance > 0.03) {
      warnings.push(`Stop loss is ${(stopDistance * 100).toFixed(2)}% away - too wide for scalping!`);
    }

    // Warn if risk/reward is poor
    const riskReward = profitDistance / stopDistance;
    if (riskReward < 1) {
      warnings.push(`Risk/reward ${riskReward.toFixed(2)}:1 is too low`);
    }

    return { isValid, warnings };
  }
}
