/**
 * AI Action Steps Routes
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { AIActionStepsService } from '../services/aiActionStepsService.js';
import { AIProviderService } from '../services/aiProvider.js';
import { TokenUsageService } from '../services/tokenUsageService.js';
import { CoinGeckoService as CoingeckoService } from '../services/coingecko.js';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: number;
    email: string;
    username: string;
  };
}

export async function actionStepsRoutes(fastify: FastifyInstance, pool: Pool) {
  // Initialize AI provider
  const aiProvider = new AIProviderService({
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    preferredProvider: (process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'auto') || 'auto',
  });

  const tokenUsageService = new TokenUsageService(pool);
  const actionStepsService = new AIActionStepsService(pool, aiProvider, tokenUsageService);
  const coingeckoService = new CoingeckoService();

  // Generate AI action steps for a coin
  fastify.post('/api/action-steps/generate', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = request.body as {
        coinId: string;
        coinSymbol: string;
        signalId?: number;
        technicalIndicators?: Record<string, any>;
        fundamentalScore?: number;
      };

      if (!body.coinId || !body.coinSymbol) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      // Get current market data
      const marketData = await coingeckoService.getCoinsMarkets([body.coinId]);

      if (marketData.length === 0) {
        return reply.code(404).send({ error: 'Coin not found' });
      }

      const coin = marketData[0];

      const actionSteps = await actionStepsService.generateActionSteps({
        userId: request.user.id,
        coinId: body.coinId,
        coinSymbol: body.coinSymbol,
        signalId: body.signalId,
        marketData: {
          currentPrice: coin.current_price,
          volume24h: coin.total_volume,
          marketCap: coin.market_cap,
          priceChange24h: coin.price_change_percentage_24h,
        },
        technicalIndicators: body.technicalIndicators,
        fundamentalScore: body.fundamentalScore,
      });

      return reply.send(actionSteps);
    } catch (error: any) {
      console.error('Error generating action steps:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get all action steps for user
  fastify.get('/api/action-steps', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const query = request.query as { status?: string };
      const actionSteps = await actionStepsService.getUserActionSteps(request.user.id, query.status);
      return reply.send(actionSteps);
    } catch (error: any) {
      console.error('Error fetching action steps:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get action steps for a specific coin
  fastify.get('/api/action-steps/coin/:coinId', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const params = request.params as { coinId: string };
      const actionSteps = await actionStepsService.getCoinActionSteps(request.user.id, params.coinId);
      return reply.send(actionSteps);
    } catch (error: any) {
      console.error('Error fetching coin action steps:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Update action steps status
  fastify.patch('/api/action-steps/:id/status', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const params = request.params as { id: string };
      const body = request.body as { status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' };

      if (!body.status || !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(body.status)) {
        return reply.code(400).send({ error: 'Invalid status' });
      }

      const actionSteps = await actionStepsService.updateStatus(
        parseInt(params.id),
        request.user.id,
        body.status
      );

      return reply.send(actionSteps);
    } catch (error: any) {
      console.error('Error updating action steps status:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Mark a specific step as completed
  fastify.patch('/api/action-steps/:id/step/:stepNumber', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const params = request.params as { id: string; stepNumber: string };
      const actionSteps = await actionStepsService.markStepCompleted(
        parseInt(params.id),
        request.user.id,
        parseInt(params.stepNumber)
      );

      return reply.send(actionSteps);
    } catch (error: any) {
      console.error('Error marking step as completed:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Delete action steps
  fastify.delete('/api/action-steps/:id', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const params = request.params as { id: string };
      await actionStepsService.deleteActionSteps(parseInt(params.id), request.user.id);
      return reply.send({ success: true });
    } catch (error: any) {
      console.error('Error deleting action steps:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
