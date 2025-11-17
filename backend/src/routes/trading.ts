import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { TradingSettings } from '../types';

interface UpdateTradingSettingsBody {
  algo_enabled?: boolean;
  run_in_background?: boolean;
  whatsapp_number?: string | null;
  whatsapp_api_key?: string | null;
}

export async function tradingRoutes(fastify: FastifyInstance) {
  // Get trading settings for the authenticated user.
  fastify.get('/api/trading/settings', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      const result = await client.query<TradingSettings>(
        `SELECT user_id, algo_enabled, run_in_background, whatsapp_number, whatsapp_api_key, updated_at
         FROM trading_settings
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        const insertResult = await client.query<TradingSettings>(
          `INSERT INTO trading_settings (user_id, algo_enabled, run_in_background)
           VALUES ($1, true, true)
           RETURNING user_id, algo_enabled, run_in_background, whatsapp_number, whatsapp_api_key, updated_at`,
          [userId]
        );
        return reply.send({ settings: insertResult.rows[0] });
      }

      return reply.send({ settings: result.rows[0] });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch trading settings' });
    } finally {
      client.release();
    }
  });

  // Update trading settings for the authenticated user.
  fastify.patch<{ Body: UpdateTradingSettingsBody }>(
    '/api/trading/settings',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { algo_enabled, run_in_background, whatsapp_number, whatsapp_api_key } = request.body;

      if (
        algo_enabled !== undefined &&
        typeof algo_enabled !== 'boolean'
      ) {
        return reply.code(400).send({ error: 'algo_enabled must be boolean' });
      }

      if (
        run_in_background !== undefined &&
        typeof run_in_background !== 'boolean'
      ) {
        return reply.code(400).send({ error: 'run_in_background must be boolean' });
      }

      const sanitizedNumber = whatsapp_number ? whatsapp_number.trim() : null;
      const sanitizedKey = whatsapp_api_key ? whatsapp_api_key.trim() : null;

      const client = await fastify.pg.connect();

      try {
        const result = await client.query<TradingSettings>(
          `INSERT INTO trading_settings (user_id, algo_enabled, run_in_background, whatsapp_number, whatsapp_api_key)
           VALUES ($1, COALESCE($2, true), COALESCE($3, true), $4, $5)
           ON CONFLICT (user_id) DO UPDATE
             SET algo_enabled = COALESCE($2, trading_settings.algo_enabled),
                 run_in_background = COALESCE($3, trading_settings.run_in_background),
                 whatsapp_number = COALESCE($4, trading_settings.whatsapp_number),
                 whatsapp_api_key = COALESCE($5, trading_settings.whatsapp_api_key),
                 updated_at = CURRENT_TIMESTAMP
           RETURNING user_id, algo_enabled, run_in_background, whatsapp_number, whatsapp_api_key, updated_at`,
          [userId, algo_enabled, run_in_background, sanitizedNumber, sanitizedKey]
        );

        return reply.send({ settings: result.rows[0] });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update trading settings' });
      } finally {
        client.release();
      }
    }
  );
}
