import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { Signal } from '../types';

export async function signalsRoutes(fastify: FastifyInstance) {
  // Get user's signals
  fastify.get('/api/signals', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

    const client = await fastify.pg.connect();

    try {
      const result = await client.query<Signal>(
        `SELECT * FROM signals
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return reply.send({ signals: result.rows });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch signals' });
    } finally {
      client.release();
    }
  });

  // Get unread signals count
  fastify.get('/api/signals/unread', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      const result = await client.query(
        'SELECT COUNT(*) as count FROM signals WHERE user_id = $1 AND is_read = false',
        [userId]
      );

      return reply.send({ count: parseInt(result.rows[0].count) });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch unread count' });
    } finally {
      client.release();
    }
  });

  // Mark signal as read
  fastify.patch<{ Params: { id: string } }>(
    '/api/signals/:id/read',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const client = await fastify.pg.connect();

      try {
        const result = await client.query<Signal>(
          'UPDATE signals SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
          [id, userId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Signal not found' });
        }

        return reply.send({ signal: result.rows[0] });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update signal' });
      } finally {
        client.release();
      }
    }
  );

  // Mark all signals as read
  fastify.post('/api/signals/read-all', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      await client.query('UPDATE signals SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);

      return reply.send({ message: 'All signals marked as read' });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to mark signals as read' });
    } finally {
      client.release();
    }
  });

  // Get signals for a specific coin
  fastify.get<{ Params: { coinId: string } }>(
    '/api/signals/coin/:coinId',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { coinId } = request.params;

      const client = await fastify.pg.connect();

      try {
        const result = await client.query<Signal>(
          `SELECT * FROM signals
           WHERE user_id = $1 AND coin_id = $2
           ORDER BY created_at DESC
           LIMIT 20`,
          [userId, coinId]
        );

        return reply.send({ signals: result.rows });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch signals' });
      } finally {
        client.release();
      }
    }
  );
}
