/**
 * Token Usage Tracking Routes
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { TokenUsageService } from '../services/tokenUsageService.js';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: number;
    email: string;
    username: string;
  };
}

export async function tokenUsageRoutes(fastify: FastifyInstance, pool: Pool) {
  const tokenUsageService = new TokenUsageService(pool);

  // Get total token usage cost for user
  fastify.get('/api/token-usage/total', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const totalCost = await tokenUsageService.getUserTotalCost(request.user.id);
      return reply.send({ total_cost_usd: totalCost });
    } catch (error: any) {
      console.error('Error fetching total token cost:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get detailed token usage summary
  fastify.get('/api/token-usage/summary', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const query = request.query as { periodDays?: string };
      const periodDays = query.periodDays ? parseInt(query.periodDays) : 30;

      const summary = await tokenUsageService.getUserSummary(request.user.id, periodDays);
      return reply.send(summary);
    } catch (error: any) {
      console.error('Error fetching token usage summary:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get recent token usage entries
  fastify.get('/api/token-usage/recent', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit) : 50;

      const recentUsage = await tokenUsageService.getUserRecentUsage(request.user.id, limit);
      return reply.send(recentUsage);
    } catch (error: any) {
      console.error('Error fetching recent token usage:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get token usage for a specific operation
  fastify.get('/api/token-usage/operation/:operation', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const params = request.params as { operation: string };
      const usage = await tokenUsageService.getOperationUsage(request.user.id, params.operation);
      return reply.send(usage);
    } catch (error: any) {
      console.error('Error fetching operation token usage:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
