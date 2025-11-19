import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

export async function newsRoutes(fastify: FastifyInstance) {
  // Get latest news (filtered by user's watchlist coins if available)
  fastify.get(
    '/api/news',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const client = await fastify.pg.connect();

      try {
        // Get user's watchlist coins
        const watchlistResult = await client.query(
          'SELECT DISTINCT coin_symbol FROM watchlist WHERE user_id = $1 AND is_active = true',
          [userId]
        );

        const userCoins = watchlistResult.rows.map((row) => row.coin_symbol);

        // Get news articles (all news + news related to user's coins)
        const query = userCoins.length > 0
          ? `SELECT * FROM news_articles
             WHERE published_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
             AND (
               coins_mentioned && $1 OR  -- Articles mentioning user's coins
               coins_mentioned = ARRAY[]::text[] -- General crypto news
             )
             ORDER BY is_trending DESC, published_at DESC
             LIMIT 100`
          : `SELECT * FROM news_articles
             WHERE published_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
             ORDER BY is_trending DESC, published_at DESC
             LIMIT 100`;

        const params = userCoins.length > 0 ? [userCoins] : [];
        const result = await client.query(query, params);

        return reply.send({ news: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch news' });
      } finally {
        client.release();
      }
    }
  );

  // Get news for specific coin
  fastify.get<{ Params: { coinSymbol: string } }>(
    '/api/news/coin/:coinSymbol',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { coinSymbol } = request.params;
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `SELECT * FROM news_articles
           WHERE $1 = ANY(coins_mentioned)
           AND published_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
           ORDER BY published_at DESC
           LIMIT 50`,
          [coinSymbol.toUpperCase()]
        );

        return reply.send({ news: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch coin news' });
      } finally {
        client.release();
      }
    }
  );

  // Get trending news
  fastify.get(
    '/api/news/trending',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `SELECT * FROM news_articles
           WHERE is_trending = true
           AND published_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
           ORDER BY votes DESC, published_at DESC
           LIMIT 30`
        );

        return reply.send({ news: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch trending news' });
      } finally {
        client.release();
      }
    }
  );

  // Get social metrics for coin
  fastify.get<{ Params: { coinSymbol: string } }>(
    '/api/social/:coinSymbol',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { coinSymbol } = request.params;
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `SELECT * FROM social_metrics
           WHERE coin_symbol = $1
           ORDER BY date DESC
           LIMIT 30`,
          [coinSymbol.toUpperCase()]
        );

        return reply.send({ metrics: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch social metrics' });
      } finally {
        client.release();
      }
    }
  );

  // Get social metrics for all watchlist coins
  fastify.get(
    '/api/social/watchlist',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const client = await fastify.pg.connect();

      try {
        // Get user's watchlist coins
        const watchlistResult = await client.query(
          'SELECT DISTINCT coin_symbol FROM watchlist WHERE user_id = $1 AND is_active = true',
          [userId]
        );

        const coinSymbols = watchlistResult.rows.map((row) => row.coin_symbol);

        if (coinSymbols.length === 0) {
          return reply.send({ metrics: [] });
        }

        // Get latest social metrics for these coins
        const result = await client.query(
          `SELECT DISTINCT ON (coin_symbol) *
           FROM social_metrics
           WHERE coin_symbol = ANY($1)
           AND date >= CURRENT_DATE - INTERVAL '7 days'
           ORDER BY coin_symbol, date DESC`,
          [coinSymbols]
        );

        return reply.send({ metrics: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch social metrics' });
      } finally {
        client.release();
      }
    }
  );

  // Get news statistics
  fastify.get(
    '/api/news/stats',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `SELECT
            source,
            COUNT(*) as article_count,
            MAX(published_at) as latest_article
           FROM news_articles
           WHERE published_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
           GROUP BY source
           ORDER BY article_count DESC`
        );

        const fetchLog = await client.query(
          'SELECT * FROM news_fetch_log ORDER BY last_fetch_at DESC'
        );

        return reply.send({
          sources: result.rows,
          fetchLog: fetchLog.rows,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch news stats' });
      } finally {
        client.release();
      }
    }
  );
}
