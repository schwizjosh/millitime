/**
 * Fundamental Analysis Service
 * Token-efficient AI-powered analysis of crypto fundamentals
 */

import { AIProviderService, AIMessage } from './aiProvider';
import { coingeckoService } from './coingecko';

export interface FundamentalData {
  coinId: string;
  coinSymbol: string;
  marketCap?: number;
  volume24h?: number;
  volumeMarketCapRatio?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
  allTimeHigh?: number;
  allTimeHighDate?: string;
  athChangePercentage?: number;
  priceChange7d?: number;
  priceChange30d?: number;
  priceChange1y?: number;
  marketCapRank?: number;
}

export interface FundamentalScore {
  overallScore: number; // 0-100
  marketPosition: number; // 0-100
  volumeHealth: number; // 0-100
  supplyDynamics: number; // 0-100
  priceAction: number; // 0-100
  aiInsight: string;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number; // 0-100
  keyFactors: string[];
}

export class FundamentalAnalysisService {
  private aiProvider: AIProviderService;

  constructor(aiProvider: AIProviderService) {
    this.aiProvider = aiProvider;
  }

  /**
   * Gather fundamental data from CoinGecko
   */
  async gatherFundamentals(coinId: string): Promise<FundamentalData | null> {
    try {
      // Fetch comprehensive coin data
      const coinData = await coingeckoService.getCoinDetails(coinId);
      if (!coinData) return null;

      const marketData = coinData.market_data;

      return {
        coinId: coinData.id,
        coinSymbol: coinData.symbol.toUpperCase(),
        marketCap: marketData?.market_cap?.usd,
        volume24h: marketData?.total_volume?.usd,
        volumeMarketCapRatio: marketData?.total_volume?.usd && marketData?.market_cap?.usd
          ? marketData.total_volume.usd / marketData.market_cap.usd
          : undefined,
        circulatingSupply: marketData?.circulating_supply,
        totalSupply: marketData?.total_supply,
        maxSupply: marketData?.max_supply,
        allTimeHigh: marketData?.ath?.usd,
        allTimeHighDate: marketData?.ath_date?.usd,
        athChangePercentage: marketData?.ath_change_percentage?.usd,
        priceChange7d: marketData?.price_change_percentage_7d,
        priceChange30d: marketData?.price_change_percentage_30d,
        priceChange1y: marketData?.price_change_percentage_1y,
        marketCapRank: coinData.market_cap_rank,
      };
    } catch (error) {
      console.error('Error gathering fundamentals:', error);
      return null;
    }
  }

  /**
   * Calculate quick fundamental score WITHOUT AI (token-free)
   */
  calculateQuickScore(data: FundamentalData): Omit<FundamentalScore, 'aiInsight' | 'keyFactors'> {
    let marketPosition = 50;
    let volumeHealth = 50;
    let supplyDynamics = 50;
    let priceAction = 50;

    // Market Position Score (based on rank and market cap)
    if (data.marketCapRank) {
      if (data.marketCapRank <= 10) marketPosition = 95;
      else if (data.marketCapRank <= 50) marketPosition = 80;
      else if (data.marketCapRank <= 100) marketPosition = 65;
      else if (data.marketCapRank <= 200) marketPosition = 50;
      else marketPosition = 30;
    }

    // Volume Health Score (volume/market cap ratio)
    if (data.volumeMarketCapRatio) {
      if (data.volumeMarketCapRatio > 0.5) volumeHealth = 95; // Very high liquidity
      else if (data.volumeMarketCapRatio > 0.2) volumeHealth = 80;
      else if (data.volumeMarketCapRatio > 0.1) volumeHealth = 65;
      else if (data.volumeMarketCapRatio > 0.05) volumeHealth = 50;
      else volumeHealth = 30; // Low liquidity warning
    }

    // Supply Dynamics Score
    if (data.maxSupply && data.circulatingSupply) {
      const supplyRatio = data.circulatingSupply / data.maxSupply;
      if (supplyRatio > 0.9) supplyDynamics = 70; // Most supply circulating (less inflation)
      else if (supplyRatio > 0.7) supplyDynamics = 60;
      else if (supplyRatio > 0.5) supplyDynamics = 50;
      else supplyDynamics = 40; // High future inflation risk
    } else if (!data.maxSupply) {
      supplyDynamics = 40; // Unlimited supply is a concern
    }

    // Price Action Score (momentum)
    let priceScore = 0;
    let priceWeights = 0;

    if (data.priceChange7d !== undefined) {
      priceScore += data.priceChange7d > 0 ? 30 : -10;
      priceWeights += 30;
    }
    if (data.priceChange30d !== undefined) {
      priceScore += data.priceChange30d > 0 ? 40 : -15;
      priceWeights += 40;
    }
    if (data.priceChange1y !== undefined) {
      priceScore += data.priceChange1y > 0 ? 30 : -10;
      priceWeights += 30;
    }

    if (priceWeights > 0) {
      priceAction = 50 + (priceScore / priceWeights) * 50;
      priceAction = Math.max(0, Math.min(100, priceAction));
    }

    // Distance from ATH (penalty for being far from ATH)
    if (data.athChangePercentage !== undefined) {
      const athDistance = Math.abs(data.athChangePercentage);
      if (athDistance < 10) priceAction += 10;
      else if (athDistance > 80) priceAction -= 15;
    }

    priceAction = Math.max(0, Math.min(100, priceAction));

    // Overall Score (weighted average)
    const overallScore = Math.round(
      marketPosition * 0.25 +
      volumeHealth * 0.25 +
      supplyDynamics * 0.2 +
      priceAction * 0.3
    );

    // Determine recommendation
    let recommendation: FundamentalScore['recommendation'];
    if (overallScore >= 80) recommendation = 'STRONG_BUY';
    else if (overallScore >= 65) recommendation = 'BUY';
    else if (overallScore >= 45) recommendation = 'HOLD';
    else if (overallScore >= 30) recommendation = 'SELL';
    else recommendation = 'STRONG_SELL';

    return {
      overallScore,
      marketPosition,
      volumeHealth,
      supplyDynamics,
      priceAction,
      recommendation,
      confidence: 70, // Medium confidence without AI
    };
  }

  /**
   * Generate AI-enhanced fundamental analysis (token-efficient)
   * Only use AI for complex insights, not basic calculations
   */
  async analyzeWithAI(data: FundamentalData): Promise<FundamentalScore> {
    // First calculate quick score without AI
    const quickScore = this.calculateQuickScore(data);

    // Build ultra-compact prompt for token efficiency
    const dataString = `${data.coinSymbol}|Rank:${data.marketCapRank}|Vol/MC:${(data.volumeMarketCapRatio || 0).toFixed(3)}|Supply:${data.circulatingSupply}/${data.maxSupply || 'inf'}|7d:${data.priceChange7d?.toFixed(1)}%|30d:${data.priceChange30d?.toFixed(1)}%|1y:${data.priceChange1y?.toFixed(1)}%|ATH:${data.athChangePercentage?.toFixed(1)}%`;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a crypto fundamental analyst. Provide concise, actionable insights in 2-3 sentences. Focus on key risks and opportunities.',
      },
      {
        role: 'user',
        content: `Analyze: ${dataString}\nScores: Market=${quickScore.marketPosition}, Volume=${quickScore.volumeHealth}, Supply=${quickScore.supplyDynamics}, Price=${quickScore.priceAction}\n\nKey insight (2-3 sentences):`,
      },
    ];

    try {
      const aiResponse = await this.aiProvider.complete(messages, {
        maxTokens: 150, // Very strict token limit
        taskComplexity: 'simple', // Use cheaper model
      });

      // Extract key factors from AI response
      const keyFactors = this.extractKeyFactors(data, quickScore);

      return {
        ...quickScore,
        aiInsight: aiResponse.content.trim(),
        keyFactors,
        confidence: 85, // Higher confidence with AI validation
      };
    } catch (error) {
      console.error('AI analysis failed, using quick score:', error);

      // Fallback without AI
      const keyFactors = this.extractKeyFactors(data, quickScore);

      return {
        ...quickScore,
        aiInsight: this.generateFallbackInsight(data, quickScore),
        keyFactors,
        confidence: 70,
      };
    }
  }

  /**
   * Extract key factors from data (no AI needed)
   */
  private extractKeyFactors(data: FundamentalData, score: any): string[] {
    const factors: string[] = [];

    if (data.marketCapRank && data.marketCapRank <= 50) {
      factors.push(`Top ${data.marketCapRank} by market cap`);
    }

    if (data.volumeMarketCapRatio && data.volumeMarketCapRatio > 0.2) {
      factors.push('High liquidity');
    } else if (data.volumeMarketCapRatio && data.volumeMarketCapRatio < 0.05) {
      factors.push('Low liquidity risk');
    }

    if (data.priceChange30d && data.priceChange30d > 20) {
      factors.push('Strong 30d momentum');
    } else if (data.priceChange30d && data.priceChange30d < -20) {
      factors.push('Weak 30d performance');
    }

    if (data.athChangePercentage && data.athChangePercentage > -20) {
      factors.push('Near all-time high');
    } else if (data.athChangePercentage && data.athChangePercentage < -80) {
      factors.push('Deep discount from ATH');
    }

    if (data.maxSupply && data.circulatingSupply && data.circulatingSupply / data.maxSupply > 0.9) {
      factors.push('Limited supply remaining');
    }

    return factors.slice(0, 5); // Max 5 factors
  }

  /**
   * Generate fallback insight without AI
   */
  private generateFallbackInsight(data: FundamentalData, score: any): string {
    const insights: string[] = [];

    if (score.overallScore >= 70) {
      insights.push(`${data.coinSymbol} shows strong fundamentals`);
    } else if (score.overallScore >= 50) {
      insights.push(`${data.coinSymbol} has moderate fundamentals`);
    } else {
      insights.push(`${data.coinSymbol} shows weak fundamentals`);
    }

    if (score.volumeHealth < 40) {
      insights.push('Low liquidity poses risk');
    }

    if (score.priceAction > 70) {
      insights.push('Strong price momentum');
    } else if (score.priceAction < 40) {
      insights.push('Weak price action');
    }

    return insights.join('. ') + '.';
  }
}
