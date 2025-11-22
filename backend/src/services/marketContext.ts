/**
 * Market Context Service
 * Provides macro market indicators for better signal filtering
 *
 * QUICK WIN IMPLEMENTATION
 * Expected improvement: -20% false signals in extreme conditions
 */

import axios from 'axios';
import { coingeckoService } from './coingecko';

export interface FearGreedIndex {
  value: number; // 0-100
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  timestamp: number;
}

export interface BTCDominance {
  value: number; // 0-100 percentage
  isRising: boolean;
  change24h: number; // Overall market change (proxy)
  phase: 'ALTSEASON' | 'PRE_ALTSEASON' | 'TRANSITION' | 'BTC_SEASON' | 'STRONG_BTC_SEASON';
}

export interface MarketContext {
  fearGreed: FearGreedIndex | null;
  btcDominance: BTCDominance | null;
  recommendedAction: 'PROCEED' | 'CAUTION' | 'AVOID';
  confidenceAdjustment: number; // -20% to 0%
  warnings: string[];
}

export class MarketContextService {
  private fearGreedCache: { data: FearGreedIndex; timestamp: number } | null = null;
  private btcDominanceCache: { data: BTCDominance; timestamp: number } | null = null;
  private cacheExpiryMs = 60 * 60 * 1000; // 1 hour cache

  /**
   * Fetch Fear & Greed Index from Alternative.me API
   * Free API, no key required
   */
  async getFearGreedIndex(): Promise<FearGreedIndex | null> {
    try {
      // Check cache
      if (
        this.fearGreedCache &&
        Date.now() - this.fearGreedCache.timestamp < this.cacheExpiryMs
      ) {
        return this.fearGreedCache.data;
      }

      const response = await axios.get('https://api.alternative.me/fng/', {
        params: { limit: 1 },
        timeout: 10000,
      });

      if (!response.data?.data?.[0]) {
        return null;
      }

      const data = response.data.data[0];
      const value = parseInt(data.value);

      const fearGreed: FearGreedIndex = {
        value,
        classification: this.classifyFearGreed(value),
        timestamp: parseInt(data.timestamp) * 1000,
      };

      // Cache result
      this.fearGreedCache = {
        data: fearGreed,
        timestamp: Date.now(),
      };

      return fearGreed;
    } catch (error: any) {
      console.error('Error fetching Fear & Greed Index:', error.message);
      return null;
    }
  }

  /**
   * Fetch BTC dominance from CoinGecko
   */
  async getBTCDominance(): Promise<BTCDominance | null> {
    try {
      // Check cache
      if (
        this.btcDominanceCache &&
        Date.now() - this.btcDominanceCache.timestamp < this.cacheExpiryMs
      ) {
        return this.btcDominanceCache.data;
      }

      // Get global market data from CoinGecko
      const globalData = await coingeckoService.getGlobalData();

      if (!globalData?.data?.market_cap_percentage?.btc) {
        return null;
      }

      const currentDominance = globalData.data.market_cap_percentage.btc;
      const change24h = globalData.data.market_cap_change_percentage_24h_usd || 0;

      // Classify dominance phase based on research:
      // < 54%: Altcoin Season, 54-57%: Pre-Altseason, 57-60%: Transition
      // 60-65%: BTC Season, > 65%: Strong BTC Season
      const phase = this.classifyDominancePhase(currentDominance);

      const btcDominance: BTCDominance = {
        value: currentDominance,
        isRising: change24h > 0,
        change24h,
        phase,
      };

      // Cache result
      this.btcDominanceCache = {
        data: btcDominance,
        timestamp: Date.now(),
      };

      return btcDominance;
    } catch (error: any) {
      console.error('Error fetching BTC dominance:', error.message);
      return null;
    }
  }

  /**
   * Get comprehensive market context
   */
  async getMarketContext(coinSymbol?: string): Promise<MarketContext> {
    const fearGreed = await this.getFearGreedIndex();
    const btcDominance = await this.getBTCDominance();

    const warnings: string[] = [];
    let confidenceAdjustment = 0;
    let recommendedAction: 'PROCEED' | 'CAUTION' | 'AVOID' = 'PROCEED';

    // Analyze Fear & Greed Index
    if (fearGreed) {
      if (fearGreed.value < 20) {
        warnings.push(`Extreme Fear (${fearGreed.value}) - market panic`);
        confidenceAdjustment -= 15;
        recommendedAction = 'CAUTION';
      } else if (fearGreed.value > 80) {
        warnings.push(`Extreme Greed (${fearGreed.value}) - overheated market`);
        confidenceAdjustment -= 15;
        recommendedAction = 'CAUTION';
      } else if (fearGreed.value < 30) {
        warnings.push(`Fear (${fearGreed.value}) - increased risk`);
        confidenceAdjustment -= 8;
      } else if (fearGreed.value > 70) {
        warnings.push(`Greed (${fearGreed.value}) - elevated risk`);
        confidenceAdjustment -= 8;
      }
    }

    // Analyze BTC Dominance for altcoins - STRICTER FILTERING
    // Based on research: altcoin season < 54%, BTC season > 60%
    if (btcDominance && coinSymbol && coinSymbol !== 'BTC') {
      const phase = btcDominance.phase;

      if (phase === 'STRONG_BTC_SEASON') {
        // > 65% dominance - very risky for altcoins
        warnings.push(
          `⚠️ Strong BTC Season (${btcDominance.value.toFixed(1)}%) - altcoins high risk`
        );
        confidenceAdjustment -= 25;
        recommendedAction = 'AVOID';
      } else if (phase === 'BTC_SEASON') {
        // 60-65% dominance - unfavorable for altcoins
        warnings.push(
          `BTC Season (${btcDominance.value.toFixed(1)}%) - altcoins underperforming`
        );
        confidenceAdjustment -= 15;
        if (recommendedAction === 'PROCEED') {
          recommendedAction = 'CAUTION';
        }
      } else if (phase === 'TRANSITION') {
        // 57-60% dominance - current zone, moderate risk
        if (btcDominance.isRising) {
          warnings.push(
            `BTC dominance rising (${btcDominance.value.toFixed(1)}%) - altcoin caution`
          );
          confidenceAdjustment -= 10;
          if (recommendedAction === 'PROCEED') {
            recommendedAction = 'CAUTION';
          }
        } else {
          warnings.push(
            `Transition zone (${btcDominance.value.toFixed(1)}%) - monitor BTC dominance`
          );
          confidenceAdjustment -= 5;
        }
      } else if (phase === 'PRE_ALTSEASON') {
        // 54-57% dominance - getting favorable
        if (!btcDominance.isRising) {
          // Dominance falling = good for altcoins
          confidenceAdjustment += 5;
        }
      } else if (phase === 'ALTSEASON') {
        // < 54% dominance - altcoins favored
        confidenceAdjustment += 10;
      }
    }

    // Determine final recommendation
    if (confidenceAdjustment <= -20) {
      recommendedAction = 'AVOID';
    } else if (confidenceAdjustment <= -10) {
      recommendedAction = 'CAUTION';
    }

    return {
      fearGreed,
      btcDominance,
      recommendedAction,
      confidenceAdjustment,
      warnings,
    };
  }

  /**
   * Classify Fear & Greed value into category
   */
  private classifyFearGreed(
    value: number
  ): 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed' {
    if (value < 20) return 'Extreme Fear';
    if (value < 40) return 'Fear';
    if (value < 60) return 'Neutral';
    if (value < 80) return 'Greed';
    return 'Extreme Greed';
  }

  /**
   * Classify BTC dominance into market phase
   * Based on historical data: altcoin season typically when BTC dom < 54%
   */
  private classifyDominancePhase(
    dominance: number
  ): 'ALTSEASON' | 'PRE_ALTSEASON' | 'TRANSITION' | 'BTC_SEASON' | 'STRONG_BTC_SEASON' {
    if (dominance < 54) return 'ALTSEASON';
    if (dominance < 57) return 'PRE_ALTSEASON';
    if (dominance < 60) return 'TRANSITION';
    if (dominance < 65) return 'BTC_SEASON';
    return 'STRONG_BTC_SEASON';
  }

  /**
   * Get market context summary for logging
   */
  getSummary(context: MarketContext): string {
    const parts: string[] = [];

    if (context.fearGreed) {
      parts.push(`Fear/Greed: ${context.fearGreed.value} (${context.fearGreed.classification})`);
    }

    if (context.btcDominance) {
      parts.push(
        `BTC Dom: ${context.btcDominance.value.toFixed(1)}% [${context.btcDominance.phase}] (${context.btcDominance.isRising ? '↑' : '↓'})`
      );
    }

    parts.push(`Action: ${context.recommendedAction}`);

    if (context.confidenceAdjustment !== 0) {
      parts.push(`Confidence: ${context.confidenceAdjustment}%`);
    }

    return parts.join(' | ');
  }
}

export const marketContextService = new MarketContextService();
