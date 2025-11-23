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
  aiUsed: boolean; // True if actual AI was called, false if rule-based

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
    let aiUsed = false; // Track if actual AI was called
    let finalType = technicalSignal.type;
    let finalStrength = technicalSignal.strength;
    let finalConfidence = overallScore;

    const needsAIArbitration = this.shouldUseAI(
      technicalSignal.type,
      technicalScore,
      fundamentalScore,
      includeAI,
      technicalSignal.hasConflict // Pass internal TA conflict flag
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
        aiUsed = true; // AI was actually called

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
        aiUsed = false; // AI call failed
      }
    } else {
      // No AI needed - use rule-based insight
      aiInsight = this.generateRuleBasedInsight(technicalSignal, fundamentalScore);
      aiRecommendation = this.mapScoreToRecommendation(overallScore, finalType);
      aiUsed = false; // Rule-based, not actual AI
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
      aiUsed,
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
    includeAI: boolean,
    hasInternalConflict?: boolean
  ): boolean {
    if (!includeAI) return false;

    // Use AI when:
    // 1. Internal technical indicator conflicts (RSI vs MACD, BB breakdown vs bounce)
    // This is critical - conflicting indicators need external analysis
    if (hasInternalConflict) {
      return true; // Internal TA conflict - need AI to analyze market context
    }

    // 2. Signals conflict (TA says BUY but FA says SELL)
    if (fundamentalScore) {
      const taIsBullish = technicalType === 'BUY';
      const faIsBullish = fundamentalScore.recommendation.includes('BUY');
      if (taIsBullish !== faIsBullish) {
        return true; // Conflict - need AI arbitration
      }
    }

    // 3. Borderline signals (40-60% confidence)
    if (technicalScore >= 40 && technicalScore <= 60) {
      return true; // Uncertainty - AI can help
    }

    // 4. Very strong signals where AI can add nuance
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
    // Build comprehensive context with all available data
    const indicators = technicalSignal.indicators;

    // Format technical data
    const technicalContext = `
TECHNICAL ANALYSIS (${technicalSignal.confidence}% confidence):
Signal: ${technicalSignal.type}
Strength: ${technicalSignal.strength}

Key Indicators:
- RSI: ${indicators.rsi?.toFixed(2) || 'N/A'} ${this.getRSIInterpretation(indicators.rsi)}
- MACD: ${indicators.macd?.MACD?.toFixed(2) || 'N/A'} (Signal: ${indicators.macd?.signal?.toFixed(2) || 'N/A'}) ${this.getMACDInterpretation(indicators.macd)}
- Volume: ${indicators.volume24h ? `${(indicators.volume24h / 1e9).toFixed(2)}B` : 'N/A'} ${indicators.volumeChange ? `(${indicators.volumeChange > 0 ? '+' : ''}${indicators.volumeChange.toFixed(1)}% vs avg)` : ''}
- ATR (Volatility): ${indicators.atr?.toFixed(2) || 'N/A'}
- Bollinger Bands: Price ${indicators.bollingerBands?.position || 'N/A'}
- SMA Trend: ${this.getSMATrend(indicators)}

Confluence Score: ${technicalSignal.confidence}%
Detected Signals: ${technicalSignal.signals?.join(', ') || 'None'}`;

    // Format fundamental data
    const fundamentalContext = fundamentalScore ? `

FUNDAMENTAL ANALYSIS (${fundamentalScore.overallScore}% score):
Recommendation: ${fundamentalScore.recommendation}
Confidence: ${fundamentalScore.confidence}%

Breakdown:
- Market Position: ${fundamentalScore.marketPosition}/100
- Volume Health: ${fundamentalScore.volumeHealth}/100
- Supply Dynamics: ${fundamentalScore.supplyDynamics}/100
- Price Action: ${fundamentalScore.priceAction}/100

Key Factors: ${fundamentalScore.keyFactors?.join(', ') || 'N/A'}
AI Insight: ${fundamentalScore.aiInsight || 'N/A'}` : `

FUNDAMENTAL ANALYSIS: Not available`;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert cryptocurrency trading analyst with deep expertise in technical and fundamental analysis.

TIMEFRAME: You are analyzing 1-HOUR candlestick data to predict price movement for the NEXT 1 HOUR.

Analyze trading signals using a rigorous step-by-step methodology:

STEP 1 - TECHNICAL ANALYSIS REVIEW:
Evaluate the 1-hour technical indicators for trend strength, momentum, and reliability. Consider confluence of multiple indicators.

STEP 2 - FUNDAMENTAL ANALYSIS REVIEW:
Assess market positioning, liquidity, and underlying fundamentals. Identify any red flags or strong positives.

STEP 3 - CONFLICT RESOLUTION:
If technical and fundamental signals conflict, determine which has stronger evidence and why.

STEP 4 - RISK ASSESSMENT:
Identify the primary risks to this trade within the next hour (volatility, liquidity, market conditions, etc.).

STEP 5 - FINAL RECOMMENDATION:
Synthesize all factors into a clear recommendation with confidence level for the NEXT 1 HOUR.

RESPONSE FORMAT (strictly follow):
RECOMMENDATION: [STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL]
CONFIDENCE: [0-100]%
REASONING: [2-3 concise bullet points explaining the decision]
PRIMARY_RISK: [One key risk factor]
OVERRIDE: [YES/NO - YES only if you have high confidence this decision is better than the technical signal]`,
      },
      {
        role: 'user',
        content: `Analyze ${coinSymbol} @ $${currentPrice.toFixed(currentPrice < 1 ? 6 : 2)}
${technicalContext}${fundamentalContext}

Provide your step-by-step analysis and recommendation:`,
      },
    ];

    const response = await this.aiProvider.complete(messages, {
      maxTokens: maxTokens || 800, // Increased for detailed CoT reasoning
      taskComplexity: 'complex', // Use Gemini 2.5 Pro (CoT) for nuanced decisions
    });

    // Parse structured response
    const content = response.content;

    // Extract recommendation
    const recMatch = content.match(/RECOMMENDATION:\s*(STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL)/i);
    const recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' =
      (recMatch?.[1]?.toUpperCase().replace(' ', '_') as any) || 'HOLD';

    // Extract confidence
    const confMatch = content.match(/CONFIDENCE:\s*(\d+)/);
    const aiConfidence = confMatch ? parseInt(confMatch[1]) : 50;

    // Extract reasoning
    const reasonMatch = content.match(/REASONING:\s*(.+?)(?=PRIMARY_RISK:|OVERRIDE:|$)/s);
    const reasoning = reasonMatch?.[1]?.trim() || content.substring(0, 200);

    // Extract primary risk
    const riskMatch = content.match(/PRIMARY_RISK:\s*(.+?)(?=OVERRIDE:|$)/s);
    const primaryRisk = riskMatch?.[1]?.trim() || 'Market volatility';

    // Extract override decision
    const overrideMatch = content.match(/OVERRIDE:\s*(YES|NO)/i);
    const shouldOverride = overrideMatch?.[1]?.toUpperCase() === 'YES';

    // Combine reasoning and risk into insight
    const insight = `${reasoning}\n\nPrimary Risk: ${primaryRisk}`;

    // Determine override strength based on confidence
    let overrideStrength: 'STRONG' | 'MODERATE' | 'WEAK' | undefined;
    if (shouldOverride) {
      if (aiConfidence >= 80) {
        overrideStrength = 'STRONG';
      } else if (aiConfidence >= 60) {
        overrideStrength = 'MODERATE';
      } else {
        overrideStrength = 'WEAK';
      }
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

    // Don't show separate confidence here - it's shown in main signal
    const strength = technicalSignal.confidence >= 70 ? 'strong' :
                     technicalSignal.confidence >= 50 ? 'moderate' : 'weak';
    insights.push(`${strength.charAt(0).toUpperCase() + strength.slice(1)} ${technicalSignal.type} signal on 1H timeframe`);

    if (fundamentalScore) {
      if (fundamentalScore.overallScore > 70) {
        insights.push('Fundamentals supportive');
      } else if (fundamentalScore.overallScore < 40) {
        insights.push('Weak fundamentals - use caution');
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

  /**
   * Helper: Interpret RSI value
   */
  private getRSIInterpretation(rsi: number | undefined): string {
    if (!rsi) return '';
    if (rsi > 70) return '(Overbought)';
    if (rsi < 30) return '(Oversold)';
    if (rsi > 60) return '(Bullish momentum)';
    if (rsi < 40) return '(Bearish momentum)';
    return '(Neutral)';
  }

  /**
   * Helper: Interpret MACD
   */
  private getMACDInterpretation(macd: any): string {
    if (!macd || !macd.MACD || !macd.signal) return '';
    const diff = macd.MACD - macd.signal;
    if (diff > 0 && macd.MACD > 0) return '(Bullish crossover)';
    if (diff > 0 && macd.MACD < 0) return '(Weakening bearish)';
    if (diff < 0 && macd.MACD > 0) return '(Weakening bullish)';
    if (diff < 0 && macd.MACD < 0) return '(Bearish crossover)';
    return '';
  }

  /**
   * Helper: Get SMA trend interpretation
   */
  private getSMATrend(indicators: any): string {
    const sma20 = indicators.sma20;
    const sma50 = indicators.sma50;
    const sma200 = indicators.sma200;

    if (!sma20 || !sma50) return 'N/A';

    const trends: string[] = [];
    if (sma20 > sma50) trends.push('SMA20>SMA50 (Bullish)');
    else trends.push('SMA20<SMA50 (Bearish)');

    if (sma200 && sma50 > sma200) trends.push('SMA50>SMA200 (Long-term bullish)');
    else if (sma200) trends.push('SMA50<SMA200 (Long-term bearish)');

    return trends.join(', ');
  }
}
