/**
 * AI Action Steps Service
 * Generates AI-powered trading action plans with step-by-step guidance
 */

import { Pool } from 'pg';
import { AIActionSteps, AIActionStep } from '../types/index.js';
import { AIProviderService, AIMessage } from './aiProvider.js';
import { TokenUsageService } from './tokenUsageService.js';

export class AIActionStepsService {
  private pool: Pool;
  private aiProvider: AIProviderService;
  private tokenUsageService: TokenUsageService;

  constructor(pool: Pool, aiProvider: AIProviderService, tokenUsageService: TokenUsageService) {
    this.pool = pool;
    this.aiProvider = aiProvider;
    this.tokenUsageService = tokenUsageService;
  }

  /**
   * Generate AI action steps for a trading signal
   */
  async generateActionSteps(params: {
    userId: number;
    coinId: string;
    coinSymbol: string;
    signalId?: number;
    marketData: {
      currentPrice: number;
      volume24h: number;
      marketCap: number;
      priceChange24h: number;
    };
    technicalIndicators?: Record<string, any>;
    fundamentalScore?: number;
  }): Promise<AIActionSteps> {
    const { userId, coinId, coinSymbol, signalId, marketData, technicalIndicators, fundamentalScore } = params;

    // Build AI prompt
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are an expert cryptocurrency trading advisor. Generate a detailed action plan with specific, actionable steps for trading decisions. Each step should be clear, practical, and prioritized.

Return ONLY a valid JSON object (no markdown, no extra text) with this structure:
{
  "steps": [
    {
      "step": 1,
      "action": "Brief action description",
      "priority": "HIGH|MEDIUM|LOW",
      "reason": "Why this step is important"
    }
  ],
  "confidence": 75,
  "reasoning": "Overall strategy explanation"
}`,
      },
      {
        role: 'user',
        content: `Generate an action plan for ${coinSymbol} (${coinId})

Current Market Data:
- Price: $${marketData.currentPrice}
- 24h Change: ${marketData.priceChange24h.toFixed(2)}%
- Volume: $${marketData.volume24h.toLocaleString()}
- Market Cap: $${marketData.marketCap.toLocaleString()}

${technicalIndicators ? `Technical Indicators:
- RSI: ${technicalIndicators.rsi?.toFixed(2)}
- MACD: ${technicalIndicators.macd?.histogram?.toFixed(4)}
- Price vs EMA9: ${technicalIndicators.emaAnalysis?.ema9Signal}
- Price vs EMA21: ${technicalIndicators.emaAnalysis?.ema21Signal}
- Bollinger Bands: ${technicalIndicators.bollingerBands?.position}` : ''}

${fundamentalScore ? `Fundamental Score: ${fundamentalScore}/100` : ''}

Generate a practical action plan with 4-6 steps that includes:
1. Immediate actions (monitoring, alerts)
2. Entry/exit strategies with specific price levels
3. Risk management steps
4. Position sizing recommendations
5. Follow-up analysis tasks

Keep steps concise and actionable.`,
      },
    ];

    try {
      const aiResponse = await this.aiProvider.complete(messages, {
        maxTokens: 1500,
        taskComplexity: 'complex',
        bypassCache: true, // Always generate fresh action steps
      });

      // Parse AI response
      let parsedResponse: { steps: AIActionStep[]; confidence: number; reasoning: string };
      try {
        parsedResponse = JSON.parse(aiResponse.content);
      } catch (parseError) {
        // If JSON parsing fails, try to extract JSON from markdown code blocks
        const jsonMatch = aiResponse.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse AI response as JSON');
        }
      }

      // Store action steps in database
      const result = await this.pool.query<AIActionSteps>(
        `INSERT INTO ai_action_steps
          (user_id, coin_id, coin_symbol, signal_id, action_plan, status, confidence, reasoning, tokens_used, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          userId,
          coinId,
          coinSymbol,
          signalId || null,
          JSON.stringify(parsedResponse.steps),
          'ACTIVE',
          parsedResponse.confidence,
          parsedResponse.reasoning,
          aiResponse.tokensUsed,
          aiResponse.costUSD,
        ]
      );

      // Record token usage
      await this.tokenUsageService.recordUsage({
        userId,
        provider: aiResponse.provider,
        model: aiResponse.model,
        operation: 'ai_action_steps',
        promptTokens: aiResponse.promptTokens,
        completionTokens: aiResponse.completionTokens,
        totalTokens: aiResponse.tokensUsed,
        costUSD: aiResponse.costUSD,
        relatedCoinId: coinId,
      });

      const actionSteps = result.rows[0];
      actionSteps.action_plan = parsedResponse.steps;

      return actionSteps;
    } catch (error: any) {
      console.error('Error generating AI action steps:', error);
      throw new Error(`Failed to generate action steps: ${error.message}`);
    }
  }

  /**
   * Get action steps for a user
   */
  async getUserActionSteps(userId: number, status?: string): Promise<AIActionSteps[]> {
    let query = 'SELECT * FROM ai_action_steps WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query<AIActionSteps>(query, params);

    return result.rows.map((row: AIActionSteps) => ({
      ...row,
      action_plan: typeof row.action_plan === 'string' ? JSON.parse(row.action_plan as any) : row.action_plan,
    }));
  }

  /**
   * Get action steps for a specific coin
   */
  async getCoinActionSteps(userId: number, coinId: string): Promise<AIActionSteps[]> {
    const result = await this.pool.query<AIActionSteps>(
      `SELECT * FROM ai_action_steps
       WHERE user_id = $1 AND coin_id = $2
       ORDER BY created_at DESC`,
      [userId, coinId]
    );

    return result.rows.map((row: AIActionSteps) => ({
      ...row,
      action_plan: typeof row.action_plan === 'string' ? JSON.parse(row.action_plan as any) : row.action_plan,
    }));
  }

  /**
   * Update action step status
   */
  async updateStatus(actionStepId: number, userId: number, status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'): Promise<AIActionSteps> {
    const completedAt = status === 'COMPLETED' ? new Date() : null;

    const result = await this.pool.query<AIActionSteps>(
      `UPDATE ai_action_steps
       SET status = $1, completed_at = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [status, completedAt, actionStepId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Action steps not found or unauthorized');
    }

    const actionSteps = result.rows[0];
    actionSteps.action_plan = typeof actionSteps.action_plan === 'string' ? JSON.parse(actionSteps.action_plan as any) : actionSteps.action_plan;

    return actionSteps;
  }

  /**
   * Mark individual step as completed
   */
  async markStepCompleted(actionStepId: number, userId: number, stepNumber: number): Promise<AIActionSteps> {
    const actionSteps = await this.pool.query<AIActionSteps>(
      'SELECT * FROM ai_action_steps WHERE id = $1 AND user_id = $2',
      [actionStepId, userId]
    );

    if (actionSteps.rows.length === 0) {
      throw new Error('Action steps not found or unauthorized');
    }

    const steps = typeof actionSteps.rows[0].action_plan === 'string'
      ? JSON.parse(actionSteps.rows[0].action_plan as any)
      : actionSteps.rows[0].action_plan;

    const stepIndex = steps.findIndex((s: AIActionStep) => s.step === stepNumber);
    if (stepIndex === -1) {
      throw new Error('Step not found');
    }

    steps[stepIndex].completed = true;

    const result = await this.pool.query<AIActionSteps>(
      `UPDATE ai_action_steps
       SET action_plan = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [JSON.stringify(steps), actionStepId, userId]
    );

    const updatedSteps = result.rows[0];
    updatedSteps.action_plan = steps;

    return updatedSteps;
  }

  /**
   * Delete action steps
   */
  async deleteActionSteps(actionStepId: number, userId: number): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM ai_action_steps WHERE id = $1 AND user_id = $2',
      [actionStepId, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('Action steps not found or unauthorized');
    }
  }
}
