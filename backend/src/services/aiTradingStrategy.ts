/**
 * AI-Enhanced Trading Strategy
 * Combines Technical Analysis + Fundamental Analysis + AI Insights
 * Optimized for token efficiency and maximum accuracy
 */

import { AIProviderService, AIMessage } from './aiProvider';
import { FundamentalAnalysisService, FundamentalScore } from './fundamentalAnalysis';
import { technicalIndicatorService, TechnicalIndicatorValues } from './technicalIndicators';
import { CandleData } from './technicalIndicators';

export interface EnhancedSignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidence: number; // 0-100

  // Technical Analysis
  technicalScore: number;
  technicalConfluence: number;
  technicalIndicators: TechnicalIndicatorValues;

  // Fundamental Analysis
  fundamentalScore: number;
  fundamentalRecommendation: string;

  // AI Analysis
  aiInsight: string;
  aiRecommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

  // Combined
  overallScore: number; // Weighted combination
  reasoning: string[];
  riskFactors: string[];

  // Metadata
  provider: string;
  tokensUsed: number;
}

export class AITradingStrategyService {
  private aiProvider: AIProviderService;
  private fundamentalAnalysis: FundamentalAnalysisService;

  constructor(aiProvider: AIProviderService) {
    this.aiProvider = aiProvider;
    this.fundamentalAnalysis = new FundamentalAnalysisService(aiProvider);
  }

  /**
   * Generate comprehensive AI-enhanced trading signal
   * Strategically uses AI only when needed to minimize token usage
   */
  async generateEnhancedSignal(
    coinId: string,
    coinSymbol: string,
    currentPrice: number,
    candles: CandleData[],
    options?: {
      includeAI?: boolean; // Default true
      includeFundamental?: boolean; // Default true
      maxTokens?: number;
    }
  ): Promise<EnhancedSignal | null> {
    const includeAI = options?.includeAI !== false;
    const includeFundamental = options?.includeFundamental !== false;

    // 1. Technical Analysis (always performed - no tokens used)
    const technicalSignal = technicalIndicatorService.generateConfluenceSignal(candles);
    if (!technicalSignal) {
      return null;
    }

    let fundamentalScore: FundamentalScore | null = null;
    let tokensUsed = 0;

    // 2. Fundamental Analysis (conditional - minimal tokens)
    if (includeFundamental) {
      try {
        const fundamentalData = await this.fundamentalAnalysis.gatherFundamentals(coinId);
        if (fundamentalData) {
          // Use AI-enhanced analysis (token-efficient)
          fundamentalScore = await this.fundamentalAnalysis.analyzeWithAI(fundamentalData);
          tokensUsed += 150; // Estimate from FA AI call
        }
      } catch (error) {
        console.error('Fundamental analysis failed:', error);
      }
    }

    // 3. Calculate weighted scores
    const weights = {
      technical: fundamentalScore ? 0.6 : 1.0, // Higher weight to TA if FA unavailable
      fundamental: fundamentalScore ? 0.4 : 0.0,
    };

    const technicalScore = technicalSignal.confidence;
    const fundamentalScoreValue = fundamentalScore?.overallScore || 50;

    const overallScore = Math.round(
      technicalScore * weights.technical +
      fundamentalScoreValue * weights.fundamental
    );

    // 4. AI Strategy Selection (only when signals conflict or borderline)
    let aiInsight = '';
    let aiRecommendation: EnhancedSignal['aiRecommendation'] = 'HOLD';
    let finalType = technicalSignal.type;
    let finalStrength = technicalSignal.strength;
    let finalConfidence = overallScore;

    const needsAIArbitration = this.shouldUseAI(
      technicalSignal.type,
      technicalScore,
      fundamentalScore,
      includeAI
    );

    if (needsAIArbitration) {
      try {
        const aiResult = await this.getAIDecision(
          coinSymbol,
          currentPrice,
          technicalSignal,
          fundamentalScore,
          options?.maxTokens
        );

        aiInsight = aiResult.insight;
        aiRecommendation = aiResult.recommendation;
        tokensUsed += aiResult.tokensUsed;

        // AI can override if confidence is high
        if (aiResult.shouldOverride) {
          finalType = this.mapAIRecommendationToSignalType(aiRecommendation);
          finalStrength = aiResult.overrideStrength || finalStrength;
          finalConfidence = Math.min(95, overallScore + 10); // Boost confidence
        }
      } catch (error) {
        console.error('AI decision failed:', error);
        aiInsight = 'AI analysis unavailable';
        aiRecommendation = 'HOLD';
      }
    } else {
      // No AI needed - use rule-based insight
      aiInsight = this.generateRuleBasedInsight(technicalSignal, fundamentalScore);
      aiRecommendation = this.mapScoreToRecommendation(overallScore, finalType);
    }

    // 5. Generate reasoning and risk factors
    const reasoning = this.generateReasoning(
      technicalSignal,
      fundamentalScore,
      aiInsight
    );

    const riskFactors = this.identifyRiskFactors(
      technicalSignal,
      fundamentalScore,
      overallScore
    );

    return {
      type: finalType,
      strength: finalStrength,
      confidence: finalConfidence,
      technicalScore,
      technicalConfluence: technicalSignal.confidence,
      technicalIndicators: technicalSignal.indicators,
      fundamentalScore: fundamentalScoreValue,
      fundamentalRecommendation: fundamentalScore?.recommendation || 'N/A',
      aiInsight,
      aiRecommendation,
      overallScore,
      reasoning,
      riskFactors,
      provider: 'AI-Enhanced Strategy',
      tokensUsed,
    };
  }

  /**
   * Determine if AI arbitration is needed
   * Strategy: Only use AI when it adds value
   */
  private shouldUseAI(
    technicalType: 'BUY' | 'SELL' | 'HOLD',
    technicalScore: number,
    fundamentalScore: FundamentalScore | null,
    includeAI: boolean
  ): boolean {
    if (!includeAI) return false;

    // Use AI when:
    // 1. Signals conflict (TA says BUY but FA says SELL)
    if (fundamentalScore) {
      const taIsBullish = technicalType === 'BUY';
      const faIsBullish = fundamentalScore.recommendation.includes('BUY');
      if (taIsBullish !== faIsBullish) {
        return true; // Conflict - need AI arbitration
      }
    }

    // 2. Borderline signals (40-60% confidence)
    if (technicalScore >= 40 && technicalScore <= 60) {
      return true; // Uncertainty - AI can help
    }

    // 3. Very strong signals where AI can add nuance
    if (technicalScore > 80 && fundamentalScore && fundamentalScore.overallScore > 75) {
      return true; // Strong signal - AI can identify optimal entry
    }

    return false; // No AI needed
  }

  /**
   * Get AI decision on conflicting or uncertain signals
   * Ultra token-efficient prompt design
   */
  private async getAIDecision(
    coinSymbol: string,
    currentPrice: number,
    technicalSignal: any,
    fundamentalScore: FundamentalScore | null,
    maxTokens?: number
  ): Promise<{
    insight: string;
    recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
    shouldOverride: boolean;
    overrideStrength?: 'STRONG' | 'MODERATE' | 'WEAK';
    tokensUsed: number;
  }> {
    // Build ultra-compact summary
    const taSummary = `${technicalSignal.type}(${technicalSignal.confidence}%)`;
    const faSummary = fundamentalScore
      ? `${fundamentalScore.recommendation}(${fundamentalScore.overallScore})`
      : 'N/A';

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are an expert crypto trader. Provide decisive, concise analysis. Format: [RECOMMENDATION]|[1-2 sentence reason]|[OVERRIDE:YES/NO]',
      },
      {
        role: 'user',
        content: `${coinSymbol} $${currentPrice}\nTA:${taSummary} FA:${faSummary}\nSignals:${technicalSignal.signals?.slice(0, 3).join(';') || 'none'}\n\nDecision:`,
      },
    ];

    const response = await this.aiProvider.complete(messages, {
      maxTokens: maxTokens || 200,
      taskComplexity: 'complex', // Use Claude for nuanced decisions
    });

    // Parse response
    const parts = response.content.split('|');
    const recText = parts[0]?.trim().toUpperCase() || 'HOLD';
    const insight = parts[1]?.trim() || response.content;
    const shouldOverride = parts[2]?.includes('YES') || false;

    let recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' = 'HOLD';
    let overrideStrength: 'STRONG' | 'MODERATE' | 'WEAK' | undefined;

    if (recText.includes('STRONG_BUY') || recText.includes('STRONG BUY')) {
      recommendation = 'STRONG_BUY';
      overrideStrength = 'STRONG';
    } else if (recText.includes('BUY')) {
      recommendation = 'BUY';
      overrideStrength = 'MODERATE';
    } else if (recText.includes('STRONG_SELL') || recText.includes('STRONG SELL')) {
      recommendation = 'STRONG_SELL';
      overrideStrength = 'STRONG';
    } else if (recText.includes('SELL')) {
      recommendation = 'SELL';
      overrideStrength = 'MODERATE';
    }

    return {
      insight,
      recommendation,
      shouldOverride,
      overrideStrength,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Map AI recommendation to signal type
   */
  private mapAIRecommendationToSignalType(
    rec: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL'
  ): 'BUY' | 'SELL' | 'HOLD' {
    if (rec.includes('BUY')) return 'BUY';
    if (rec.includes('SELL')) return 'SELL';
    return 'HOLD';
  }

  /**
   * Map overall score to recommendation
   */
  private mapScoreToRecommendation(
    score: number,
    type: 'BUY' | 'SELL' | 'HOLD'
  ): 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' {
    if (type === 'BUY') {
      return score >= 80 ? 'STRONG_BUY' : score >= 60 ? 'BUY' : 'HOLD';
    } else if (type === 'SELL') {
      return score >= 80 ? 'STRONG_SELL' : score >= 60 ? 'SELL' : 'HOLD';
    }
    return 'HOLD';
  }

  /**
   * Generate rule-based insight (no AI needed)
   */
  private generateRuleBasedInsight(
    technicalSignal: any,
    fundamentalScore: FundamentalScore | null
  ): string {
    const insights: string[] = [];

    insights.push(
      `Technical analysis shows ${technicalSignal.type} with ${technicalSignal.confidence}% confidence`
    );

    if (fundamentalScore) {
      if (fundamentalScore.overallScore > 70) {
        insights.push('Strong fundamentals support this position');
      } else if (fundamentalScore.overallScore < 40) {
        insights.push('Weak fundamentals suggest caution');
      }
    }

    return insights.join('. ') + '.';
  }

  /**
   * Generate reasoning array
   */
  private generateReasoning(
    technicalSignal: any,
    fundamentalScore: FundamentalScore | null,
    aiInsight: string
  ): string[] {
    const reasoning: string[] = [];

    // Technical reasons
    if (technicalSignal.signals && technicalSignal.signals.length > 0) {
      reasoning.push(...technicalSignal.signals.slice(0, 3));
    }

    // Fundamental reasons
    if (fundamentalScore && fundamentalScore.keyFactors) {
      reasoning.push(...fundamentalScore.keyFactors.slice(0, 2));
    }

    // AI insight
    if (aiInsight && aiInsight !== 'AI analysis unavailable') {
      reasoning.push(`AI: ${aiInsight}`);
    }

    return reasoning.slice(0, 6); // Max 6 reasons
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    technicalSignal: any,
    fundamentalScore: FundamentalScore | null,
    overallScore: number
  ): string[] {
    const risks: string[] = [];

    // Low confidence
    if (overallScore < 50) {
      risks.push('Low overall confidence');
    }

    // Fundamental risks
    if (fundamentalScore) {
      if (fundamentalScore.volumeHealth < 40) {
        risks.push('Low liquidity risk');
      }
      if (fundamentalScore.supplyDynamics < 40) {
        risks.push('High inflation risk');
      }
    }

    // Technical risks
    if (technicalSignal.indicators.rsi > 70) {
      risks.push('Overbought conditions');
    } else if (technicalSignal.indicators.rsi < 30) {
      risks.push('Oversold conditions');
    }

    return risks.slice(0, 4);
  }
}
