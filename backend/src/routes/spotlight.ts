import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { SpotlightCoin } from '../types';

export async function spotlightRoutes(fastify: FastifyInstance) {
  // Get today's spotlight coins
  fastify.get('/api/spotlight/coins', { preHandler: authMiddleware }, async (request, reply) => {
    const client = await fastify.pg.connect();

    try {
      const result = await client.query<SpotlightCoin>(
        `SELECT * FROM spotlight_coins
         WHERE discovery_date = CURRENT_DATE
         AND is_active = true
         ORDER BY trending_score DESC
         LIMIT 30`
      );

      return reply.send({ coins: result.rows });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch spotlight coins' });
    } finally {
      client.release();
    }
  });

  // Get user's monitored spotlight coins
  fastify.get(
    '/api/spotlight/monitored',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `SELECT sc.*, usm.started_at, usm.is_active as monitoring_active
           FROM spotlight_coins sc
           JOIN user_spotlight_monitoring usm ON sc.id = usm.spotlight_coin_id
           WHERE usm.user_id = $1
           AND usm.is_active = true
           ORDER BY usm.started_at DESC`,
          [userId]
        );

        return reply.send({ coins: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch monitored spotlight coins' });
      } finally {
        client.release();
      }
    }
  );

  // Start monitoring a spotlight coin
  fastify.post<{ Body: { spotlight_coin_id: number } }>(
    '/api/spotlight/monitor',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { spotlight_coin_id } = request.body;

      if (!spotlight_coin_id) {
        return reply.code(400).send({ error: 'spotlight_coin_id is required' });
      }

      const client = await fastify.pg.connect();

      try {
        // First, get the spotlight coin details
        const coinResult = await client.query(
          `SELECT coin_id, coin_symbol, coin_name FROM spotlight_coins WHERE id = $1`,
          [spotlight_coin_id]
        );

        if (coinResult.rows.length === 0) {
          return reply.code(404).send({ error: 'Spotlight coin not found' });
        }

        const coin = coinResult.rows[0];

        // Add to user's monitoring
        await client.query(
          `INSERT INTO user_spotlight_monitoring (user_id, spotlight_coin_id, is_active)
           VALUES ($1, $2, true)
           ON CONFLICT (user_id, spotlight_coin_id)
           DO UPDATE SET is_active = true, started_at = CURRENT_TIMESTAMP`,
          [userId, spotlight_coin_id]
        );

        // Also add to watchlist for automatic signal generation
        await client.query(
          `INSERT INTO watchlist (user_id, coin_id, coin_symbol, coin_name, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (user_id, coin_id)
           DO UPDATE SET is_active = true`,
          [userId, coin.coin_id, coin.coin_symbol, coin.coin_name]
        );

        return reply.send({ success: true, message: 'Started monitoring coin' });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to start monitoring' });
      } finally {
        client.release();
      }
    }
  );

  // Stop monitoring a spotlight coin
  fastify.delete<{ Params: { spotlight_coin_id: string } }>(
    '/api/spotlight/monitor/:spotlight_coin_id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const spotlightCoinId = parseInt(request.params.spotlight_coin_id);

      const client = await fastify.pg.connect();

      try {
        await client.query(
          `UPDATE user_spotlight_monitoring
           SET is_active = false
           WHERE user_id = $1 AND spotlight_coin_id = $2`,
          [userId, spotlightCoinId]
        );

        return reply.send({ success: true, message: 'Stopped monitoring coin' });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to stop monitoring' });
      } finally {
        client.release();
      }
    }
  );

  // Get spotlight coins history (past days)
  fastify.get<{ Querystring: { days?: string } }>(
    '/api/spotlight/history',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const days = parseInt(request.query.days || '7');
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `SELECT discovery_date, COUNT(*) as coin_count, AVG(trending_score) as avg_score
           FROM spotlight_coins
           WHERE discovery_date >= CURRENT_DATE - INTERVAL '${days} days'
           GROUP BY discovery_date
           ORDER BY discovery_date DESC`
        );

        return reply.send({ history: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch spotlight history' });
      } finally {
        client.release();
      }
    }
  );
}
