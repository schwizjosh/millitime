/**
 * Token Usage Tracking Service
 * Records AI token consumption and costs for accountability
 */

import { Pool } from 'pg';
import { TokenUsage, TokenCostSummary } from '../types/index.js';

export class TokenUsageService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Record token usage for an AI operation
   */
  async recordUsage(usage: {
    userId: number;
    provider: 'openai' | 'anthropic';
    model: string;
    operation: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUSD: number;
    relatedCoinId?: string;
  }): Promise<TokenUsage> {
    const result = await this.pool.query<TokenUsage>(
      `INSERT INTO token_usage
        (user_id, provider, model, operation, prompt_tokens, completion_tokens, total_tokens, cost_usd, related_coin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        usage.userId,
        usage.provider,
        usage.model,
        usage.operation,
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        usage.costUSD,
        usage.relatedCoinId || null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Get total token usage cost for a user
   */
  async getUserTotalCost(userId: number): Promise<number> {
    const result = await this.pool.query<{ total_cost: string }>(
      'SELECT COALESCE(SUM(cost_usd), 0) as total_cost FROM token_usage WHERE user_id = $1',
      [userId]
    );

    return parseFloat(result.rows[0].total_cost);
  }

  /**
   * Get detailed token usage summary for a user
   */
  async getUserSummary(userId: number, periodDays: number = 30): Promise<TokenCostSummary> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    // Total cost and tokens
    const totalResult = await this.pool.query<{ total_cost: string; total_tokens: string }>(
      `SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(total_tokens), 0) as total_tokens
       FROM token_usage
       WHERE user_id = $1 AND created_at >= $2`,
      [userId, periodStart]
    );

    // By provider
    const providerResult = await this.pool.query<{ provider: string; cost: string }>(
      `SELECT
        provider,
        COALESCE(SUM(cost_usd), 0) as cost
       FROM token_usage
       WHERE user_id = $1 AND created_at >= $2
       GROUP BY provider`,
      [userId, periodStart]
    );

    // By operation
    const operationResult = await this.pool.query<{ operation: string; cost: string }>(
      `SELECT
        operation,
        COALESCE(SUM(cost_usd), 0) as cost
       FROM token_usage
       WHERE user_id = $1 AND created_at >= $2
       GROUP BY operation
       ORDER BY cost DESC`,
      [userId, periodStart]
    );

    const byProvider = {
      openai: 0,
      anthropic: 0,
    };

    providerResult.rows.forEach((row: { provider: string; cost: string }) => {
      if (row.provider === 'openai' || row.provider === 'anthropic') {
        byProvider[row.provider as 'openai' | 'anthropic'] = parseFloat(row.cost);
      }
    });

    const byOperation: Record<string, number> = {};
    operationResult.rows.forEach((row: { operation: string; cost: string }) => {
      byOperation[row.operation] = parseFloat(row.cost);
    });

    return {
      total_cost_usd: parseFloat(totalResult.rows[0].total_cost),
      by_provider: byProvider,
      by_operation: byOperation,
      total_tokens: parseInt(totalResult.rows[0].total_tokens),
      period_start: periodStart,
      period_end: new Date(),
    };
  }

  /**
   * Get recent token usage entries for a user
   */
  async getUserRecentUsage(userId: number, limit: number = 50): Promise<TokenUsage[]> {
    const result = await this.pool.query<TokenUsage>(
      `SELECT * FROM token_usage
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get token usage for a specific operation type
   */
  async getOperationUsage(userId: number, operation: string): Promise<TokenUsage[]> {
    const result = await this.pool.query<TokenUsage>(
      `SELECT * FROM token_usage
       WHERE user_id = $1 AND operation = $2
       ORDER BY created_at DESC`,
      [userId, operation]
    );

    return result.rows;
  }
}
