/**
 * Sentiment Analysis Service
 * Fetches social sentiment data to enhance signal quality
 *
 * QUICK WIN #4: Integrate sentiment analysis
 * Expected improvement: +3-5% accuracy
 */

import { coingeckoService } from './coingecko';

export interface SentimentData {
  coinId: string;
  coinSymbol: string;
  sentimentScore: number; // -100 to +100
  socialDominance: number; // 0-100
  communityScore: number; // 0-100
  developerScore: number; // 0-100
  recommendation: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  signals: string[];
  hasData: boolean;
}

export interface SentimentAdjustment {
  confidenceAdjustment: number; // -10 to +10
  recommendation: string;
  warnings: string[];
}

export class SentimentAnalysisService {
  private sentimentCache: Map<string, { data: SentimentData; timestamp: number }> = new Map();
  private cacheExpiryMs = 60 * 60 * 1000; // 1 hour cache

  /**
   * Get sentiment data for a coin from CoinGecko community metrics
   * This is free and doesn't require additional API keys
   */
  async getSentiment(coinId: string, coinSymbol: string): Promise<SentimentData> {
    // Check cache
    const cached = this.sentimentCache.get(coinId);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.data;
    }

    try {
      // Get detailed coin data with community and developer scores
      const coinDetails = await coingeckoService.getCoinDetails(coinId);

      if (!coinDetails) {
        return this.createEmptySentiment(coinId, coinSymbol);
      }

      // Extract sentiment indicators
      const communityScore = coinDetails.community_score || 0;
      const developerScore = coinDetails.developer_score || 0;
      const publicInterestScore = coinDetails.public_interest_stats?.alexa_rank
        ? Math.max(0, 100 - (coinDetails.public_interest_stats.alexa_rank / 100000) * 100)
        : 0;

      // Calculate overall sentiment (-100 to +100)
      const sentimentScore = ((communityScore + developerScore + publicInterestScore) / 3 - 50) * 2;

      // Determine recommendation
      let recommendation: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
      if (sentimentScore > 20) recommendation = 'BULLISH';
      else if (sentimentScore < -20) recommendation = 'BEARISH';
      else recommendation = 'NEUTRAL';

      // Generate signals
      const signals: string[] = [];

      if (communityScore > 70) {
        signals.push('Strong community support');
      } else if (communityScore < 30) {
        signals.push('Weak community engagement');
      }

      if (developerScore > 70) {
        signals.push('Active development');
      } else if (developerScore < 30) {
        signals.push('Low developer activity');
      }

      // Social media presence
      const twitterFollowers = coinDetails.community_data?.twitter_followers || 0;
      const redditSubscribers = coinDetails.community_data?.reddit_subscribers || 0;

      const socialDominance = Math.min(
        100,
        (Math.log10(twitterFollowers + redditSubscribers + 1) / Math.log10(1000000)) * 100
      );

      if (socialDominance > 60) {
        signals.push('High social media presence');
      } else if (socialDominance < 20) {
        signals.push('Limited social reach');
      }

      const sentiment: SentimentData = {
        coinId,
        coinSymbol,
        sentimentScore,
        socialDominance,
        communityScore,
        developerScore,
        recommendation,
        signals,
        hasData: true,
      };

      // Cache result
      this.sentimentCache.set(coinId, {
        data: sentiment,
        timestamp: Date.now(),
      });

      return sentiment;
    } catch (error: any) {
      console.error(`Error fetching sentiment for ${coinSymbol}:`, error.message);
      return this.createEmptySentiment(coinId, coinSymbol);
    }
  }

  /**
   * Create empty sentiment when data is unavailable
   */
  private createEmptySentiment(coinId: string, coinSymbol: string): SentimentData {
    return {
      coinId,
      coinSymbol,
      sentimentScore: 0,
      socialDominance: 0,
      communityScore: 0,
      developerScore: 0,
      recommendation: 'NEUTRAL',
      signals: [],
      hasData: false,
    };
  }

  /**
   * Calculate confidence adjustment based on sentiment alignment with signal
   */
  analyzeSentiment(
    sentiment: SentimentData,
    signalType: 'BUY' | 'SELL' | 'HOLD'
  ): SentimentAdjustment {
    if (!sentiment.hasData) {
      return {
        confidenceAdjustment: 0,
        recommendation: 'No sentiment data available',
        warnings: [],
      };
    }

    const warnings: string[] = [];
    let confidenceAdjustment = 0;

    // Check alignment between sentiment and signal
    if (signalType === 'BUY') {
      if (sentiment.recommendation === 'BULLISH') {
        confidenceAdjustment += 5;
        warnings.push(`✅ Bullish sentiment aligns with BUY signal`);
      } else if (sentiment.recommendation === 'BEARISH') {
        confidenceAdjustment -= 8;
        warnings.push(`⚠️  Bearish sentiment conflicts with BUY signal`);
      }

      // Strong community support boosts BUY signals
      if (sentiment.communityScore > 70) {
        confidenceAdjustment += 3;
      } else if (sentiment.communityScore < 30) {
        confidenceAdjustment -= 3;
        warnings.push('Weak community support');
      }

      // High social dominance is positive for BUY
      if (sentiment.socialDominance > 60) {
        confidenceAdjustment += 2;
      }
    } else if (signalType === 'SELL') {
      if (sentiment.recommendation === 'BEARISH') {
        confidenceAdjustment += 5;
        warnings.push(`✅ Bearish sentiment aligns with SELL signal`);
      } else if (sentiment.recommendation === 'BULLISH') {
        confidenceAdjustment -= 8;
        warnings.push(`⚠️  Bullish sentiment conflicts with SELL signal`);
      }

      // Strong community might resist sell-off
      if (sentiment.communityScore > 70) {
        confidenceAdjustment -= 3;
        warnings.push('Strong community may resist decline');
      }
    }

    // Cap adjustments
    confidenceAdjustment = Math.max(-10, Math.min(10, confidenceAdjustment));

    const recommendation =
      confidenceAdjustment > 3
        ? 'Sentiment strongly supports signal'
        : confidenceAdjustment > 0
        ? 'Sentiment supports signal'
        : confidenceAdjustment < -3
        ? 'Sentiment conflicts with signal - caution advised'
        : confidenceAdjustment < 0
        ? 'Mixed sentiment'
        : 'Neutral sentiment';

    return {
      confidenceAdjustment,
      recommendation,
      warnings,
    };
  }

  /**
   * Get sentiment summary for logging
   */
  getSummary(sentiment: SentimentData): string {
    if (!sentiment.hasData) {
      return 'No sentiment data';
    }

    return `Sentiment: ${sentiment.recommendation} (${sentiment.sentimentScore.toFixed(0)}) | Community: ${sentiment.communityScore.toFixed(0)} | Social: ${sentiment.socialDominance.toFixed(0)}`;
  }
}

export const sentimentAnalysisService = new SentimentAnalysisService();
