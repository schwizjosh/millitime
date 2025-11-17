/**
 * Portfolio and Trading Routes
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { PortfolioService } from '../services/portfolioService.js';
import { CoinGeckoService as CoingeckoService } from '../services/coingecko.js';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: number;
    email: string;
    username: string;
  };
}

export async function portfolioRoutes(fastify: FastifyInstance, pool: Pool) {
  const portfolioService = new PortfolioService(pool);
  const coingeckoService = new CoingeckoService();

  // Get user settings
  fastify.get('/api/portfolio/settings', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const settings = await portfolioService.getUserSettings(request.user.id);
      return reply.send(settings);
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Update user settings
  fastify.patch('/api/portfolio/settings', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = request.body as any;
      const settings = await portfolioService.updateUserSettings(request.user.id, body);
      return reply.send(settings);
    } catch (error: any) {
      console.error('Error updating settings:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get user portfolio
  fastify.get('/api/portfolio', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const portfolio = await portfolioService.getUserPortfolio(request.user.id);
      return reply.send(portfolio);
    } catch (error: any) {
      console.error('Error fetching portfolio:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get portfolio summary with current values
  fastify.get('/api/portfolio/summary', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const portfolio = await portfolioService.getUserPortfolio(request.user.id);

      // Get current prices for all holdings
      const coinIds = portfolio.map(h => h.coin_id);
      let currentPrices: Record<string, number> = {};

      if (coinIds.length > 0) {
        const marketData = await coingeckoService.getCoinsMarkets(coinIds);

        currentPrices = marketData.reduce((acc, coin) => {
          acc[coin.id] = coin.current_price;
          return acc;
        }, {} as Record<string, number>);
      }

      const summary = await portfolioService.getPortfolioSummary(request.user.id, currentPrices);
      return reply.send(summary);
    } catch (error: any) {
      console.error('Error fetching portfolio summary:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Execute buy trade
  fastify.post('/api/portfolio/buy', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = request.body as {
        coinId: string;
        coinSymbol: string;
        coinName: string;
        quantity: number;
        price: number;
        fee?: number;
      };

      if (!body.coinId || !body.coinSymbol || !body.coinName || !body.quantity || !body.price) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      if (body.quantity <= 0) {
        return reply.code(400).send({ error: 'Quantity must be positive' });
      }

      if (body.price <= 0) {
        return reply.code(400).send({ error: 'Price must be positive' });
      }

      const result = await portfolioService.executeBuy(
        request.user.id,
        body.coinId,
        body.coinSymbol,
        body.coinName,
        body.quantity,
        body.price,
        body.fee || 0
      );

      return reply.send(result);
    } catch (error: any) {
      console.error('Error executing buy:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Execute sell trade
  fastify.post('/api/portfolio/sell', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = request.body as {
        coinId: string;
        coinSymbol: string;
        quantity: number;
        price: number;
        fee?: number;
      };

      if (!body.coinId || !body.coinSymbol || !body.quantity || !body.price) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      if (body.quantity <= 0) {
        return reply.code(400).send({ error: 'Quantity must be positive' });
      }

      if (body.price <= 0) {
        return reply.code(400).send({ error: 'Price must be positive' });
      }

      const result = await portfolioService.executeSell(
        request.user.id,
        body.coinId,
        body.coinSymbol,
        body.quantity,
        body.price,
        body.fee || 0
      );

      return reply.send(result);
    } catch (error: any) {
      console.error('Error executing sell:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Execute swap trade
  fastify.post('/api/portfolio/swap', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = request.body as {
        fromCoinId: string;
        fromCoinSymbol: string;
        fromQuantity: number;
        toCoinId: string;
        toCoinSymbol: string;
        toCoinName: string;
        fromPrice: number;
        toPrice: number;
        fee?: number;
      };

      if (!body.fromCoinId || !body.fromCoinSymbol || !body.fromQuantity ||
          !body.toCoinId || !body.toCoinSymbol || !body.toCoinName ||
          !body.fromPrice || !body.toPrice) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      if (body.fromQuantity <= 0) {
        return reply.code(400).send({ error: 'Quantity must be positive' });
      }

      if (body.fromPrice <= 0 || body.toPrice <= 0) {
        return reply.code(400).send({ error: 'Prices must be positive' });
      }

      const result = await portfolioService.executeSwap(
        request.user.id,
        body.fromCoinId,
        body.fromCoinSymbol,
        body.fromQuantity,
        body.toCoinId,
        body.toCoinSymbol,
        body.toCoinName,
        body.fromPrice,
        body.toPrice,
        body.fee || 0
      );

      return reply.send(result);
    } catch (error: any) {
      console.error('Error executing swap:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get trade history
  fastify.get('/api/portfolio/trades', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit) : 50;

      const trades = await portfolioService.getUserTradeHistory(request.user.id, limit);
      return reply.send(trades);
    } catch (error: any) {
      console.error('Error fetching trade history:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get trade history for a specific coin
  fastify.get('/api/portfolio/trades/:coinId', async (request: AuthenticatedRequest, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const params = request.params as { coinId: string };
      const trades = await portfolioService.getCoinTradeHistory(request.user.id, params.coinId);
      return reply.send(trades);
    } catch (error: any) {
      console.error('Error fetching coin trade history:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
