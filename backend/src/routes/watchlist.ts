import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { WatchlistItem } from '../types';
import { coingeckoService } from '../services/coingecko';

interface AddToWatchlistBody {
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
}

export async function watchlistRoutes(fastify: FastifyInstance) {
  // Get user's watchlist
  fastify.get('/api/watchlist', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      const result = await client.query<WatchlistItem>(
        'SELECT * FROM watchlist WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );

      return reply.send({ watchlist: result.rows });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch watchlist' });
    } finally {
      client.release();
    }
  });

  // Add coin to watchlist
  fastify.post<{ Body: AddToWatchlistBody }>(
    '/api/watchlist',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { coin_id, coin_symbol, coin_name } = request.body;

      if (!coin_id || !coin_symbol || !coin_name) {
        return reply.code(400).send({ error: 'coin_id, coin_symbol, and coin_name are required' });
      }

      const client = await fastify.pg.connect();

      try {
        // Check if already in watchlist
        const existing = await client.query(
          'SELECT id FROM watchlist WHERE user_id = $1 AND coin_id = $2',
          [userId, coin_id]
        );

        if (existing.rows.length > 0) {
          return reply.code(409).send({ error: 'Coin already in watchlist' });
        }

        // Insert into watchlist
        const result = await client.query<WatchlistItem>(
          'INSERT INTO watchlist (user_id, coin_id, coin_symbol, coin_name) VALUES ($1, $2, $3, $4) RETURNING *',
          [userId, coin_id, coin_symbol, coin_name]
        );

        return reply.code(201).send({ item: result.rows[0] });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to add coin to watchlist' });
      } finally {
        client.release();
      }
    }
  );

  // Remove coin from watchlist
  fastify.delete<{ Params: { id: string } }>(
    '/api/watchlist/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          'DELETE FROM watchlist WHERE id = $1 AND user_id = $2 RETURNING id',
          [id, userId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Watchlist item not found' });
        }

        return reply.send({ message: 'Coin removed from watchlist' });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to remove coin from watchlist' });
      } finally {
        client.release();
      }
    }
  );

  // Toggle watchlist item active status
  fastify.patch<{ Params: { id: string }; Body: { is_active: boolean } }>(
    '/api/watchlist/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const { is_active } = request.body;

      if (typeof is_active !== 'boolean') {
        return reply.code(400).send({ error: 'is_active must be a boolean' });
      }

      const client = await fastify.pg.connect();

      try {
        const result = await client.query<WatchlistItem>(
          'UPDATE watchlist SET is_active = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
          [is_active, id, userId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Watchlist item not found' });
        }

        return reply.send({ item: result.rows[0] });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update watchlist item' });
      } finally {
        client.release();
      }
    }
  );

  // Get available coins from CoinGecko
  fastify.get('/api/coins/search', { preHandler: authMiddleware }, async (request, reply) => {
    const { query } = request.query as { query?: string };

    try {
      if (query) {
        const results = await coingeckoService.searchCoins(query);
        return reply.send({ coins: results.coins || [] });
      } else {
        // Return top 100 coins by market cap
        const coins = await coingeckoService.getTopCoins(100);
        return reply.send({ coins });
      }
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch coins' });
    }
  });

  // Get current prices for watchlist coins
  fastify.get('/api/watchlist/prices', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      // Get user's watchlist
      const watchlistResult = await client.query<WatchlistItem>(
        'SELECT coin_id FROM watchlist WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (watchlistResult.rows.length === 0) {
        return reply.send({ prices: [] });
      }

      const coinIds = watchlistResult.rows.map((row: any) => row.coin_id);

      // Fetch current prices from CoinGecko with rate limit handling
      let marketData;
      try {
        marketData = await coingeckoService.getCoinsMarkets(coinIds);
      } catch (apiError: any) {
        // If rate limited (429), return empty array gracefully
        if (apiError.response?.status === 429) {
          fastify.log.warn('CoinGecko rate limit reached, returning empty prices');
          return reply.send({ prices: [], rateLimited: true });
        }
        throw apiError;
      }

      // Store prices in price_history table
      for (const coin of marketData) {
        await client.query(
          `INSERT INTO price_history
           (coin_id, price, market_cap, volume_24h, price_change_24h, price_change_percentage_24h)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            coin.id,
            coin.current_price,
            coin.market_cap,
            coin.total_volume,
            coin.price_change_24h,
            coin.price_change_percentage_24h,
          ]
        );
      }

      return reply.send({ prices: marketData });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch prices' });
    } finally {
      client.release();
    }
  });
}
