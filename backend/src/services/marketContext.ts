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
  change24h: number;
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

      const btcDominance: BTCDominance = {
        value: currentDominance,
        isRising: change24h > 0,
        change24h,
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

    // Analyze BTC Dominance for altcoins
    if (btcDominance && coinSymbol && coinSymbol !== 'BTC') {
      if (btcDominance.isRising && btcDominance.change24h > 1) {
        warnings.push(
          `BTC dominance rising (${btcDominance.value.toFixed(1)}%) - altcoins may underperform`
        );
        confidenceAdjustment -= 10;

        if (recommendedAction === 'PROCEED') {
          recommendedAction = 'CAUTION';
        }
      } else if (btcDominance.value > 60) {
        warnings.push(`High BTC dominance (${btcDominance.value.toFixed(1)}%) - altcoin risk`);
        confidenceAdjustment -= 5;
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
   * Get market context summary for logging
   */
  getSummary(context: MarketContext): string {
    const parts: string[] = [];

    if (context.fearGreed) {
      parts.push(`Fear/Greed: ${context.fearGreed.value} (${context.fearGreed.classification})`);
    }

    if (context.btcDominance) {
      parts.push(
        `BTC Dominance: ${context.btcDominance.value.toFixed(1)}% (${context.btcDominance.isRising ? '↑' : '↓'})`
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
