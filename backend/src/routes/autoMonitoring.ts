import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import AutoMonitoringService from '../services/autoMonitoringService';

let getAutoMonitoringService: () => AutoMonitoringService | null;

export async function autoMonitoringRoutes(fastify: FastifyInstance, options: { getAutoMonitoringService: () => AutoMonitoringService | null }) {
  getAutoMonitoringService = options.getAutoMonitoringService;

  // Get auto-monitored coins for the current user
  fastify.get('/api/auto-monitoring/coins', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const service = getAutoMonitoringService();
    if (!service) {
      return reply.code(503).send({ error: 'Auto-monitoring service not ready' });
    }

    try {
      const coins = await service.getAutoMonitoredCoins(userId);
      return reply.send({ coins });
    } catch (error: any) {
      fastify.log.error('Error fetching auto-monitored coins:', error);
      return reply.code(500).send({ error: 'Failed to fetch auto-monitored coins' });
    }
  });

  // Get auto-monitoring logs for the current user
  fastify.get('/api/auto-monitoring/logs', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { limit } = request.query as { limit?: string };
    const service = getAutoMonitoringService();
    if (!service) {
      return reply.code(503).send({ error: 'Auto-monitoring service not ready' });
    }

    try {
      const logs = await service.getAutoMonitoringLogs(
        userId,
        limit ? parseInt(limit) : 100
      );
      return reply.send({ logs });
    } catch (error: any) {
      fastify.log.error('Error fetching auto-monitoring logs:', error);
      return reply.code(500).send({ error: 'Failed to fetch auto-monitoring logs' });
    }
  });

  // Get auto-monitoring config for the current user
  fastify.get('/api/auto-monitoring/config', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      const result = await client.query(
        `SELECT * FROM auto_monitoring_config WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default config if doesn't exist
        const insertResult = await client.query(
          `INSERT INTO auto_monitoring_config (user_id) VALUES ($1) RETURNING *`,
          [userId]
        );
        return reply.send({ config: insertResult.rows[0] });
      }

      return reply.send({ config: result.rows[0] });
    } catch (error: any) {
      fastify.log.error('Error fetching auto-monitoring config:', error);
      return reply.code(500).send({ error: 'Failed to fetch auto-monitoring config' });
    } finally {
      client.release();
    }
  });

  // Update auto-monitoring config for the current user
  fastify.put('/api/auto-monitoring/config', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const config = request.body as any;
    const service = getAutoMonitoringService();
    if (!service) {
      return reply.code(503).send({ error: 'Auto-monitoring service not ready' });
    }

    try {
      await service.updateConfig(userId, config);

      // Fetch updated config
      const client = await fastify.pg.connect();
      try {
        const result = await client.query(
          `SELECT * FROM auto_monitoring_config WHERE user_id = $1`,
          [userId]
        );
        return reply.send({ config: result.rows[0] });
      } finally {
        client.release();
      }
    } catch (error: any) {
      fastify.log.error('Error updating auto-monitoring config:', error);
      return reply.code(500).send({ error: 'Failed to update auto-monitoring config' });
    }
  });

  // Get statistics about auto-monitoring
  fastify.get('/api/auto-monitoring/stats', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      // Get counts by monitoring reason
      const reasonStats = await client.query(
        `SELECT
          monitoring_reason,
          COUNT(*) as count,
          AVG(price_change_24h) as avg_price_change,
          AVG(volume_24h) as avg_volume
        FROM auto_monitored_coins
        WHERE user_id = $1 AND is_active = true
        GROUP BY monitoring_reason`,
        [userId]
      );

      // Get total counts
      const totalStats = await client.query(
        `SELECT
          COUNT(*) FILTER (WHERE is_active = true) as active_count,
          COUNT(*) FILTER (WHERE is_active = false) as removed_count,
          COUNT(*) as total_count
        FROM auto_monitored_coins
        WHERE user_id = $1`,
        [userId]
      );

      // Get recent actions
      const recentActions = await client.query(
        `SELECT action, COUNT(*) as count
        FROM auto_monitoring_log
        WHERE user_id = $1
          AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY action`,
        [userId]
      );

      return reply.send({
        byReason: reasonStats.rows,
        totals: totalStats.rows[0],
        recentActions: recentActions.rows
      });
    } catch (error: any) {
      fastify.log.error('Error fetching auto-monitoring stats:', error);
      return reply.code(500).send({ error: 'Failed to fetch auto-monitoring stats' });
    } finally {
      client.release();
    }
  });

  // Manually trigger a scan (admin/testing)
  fastify.post('/api/auto-monitoring/scan', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      // This will be handled by the service's scheduled scan
      // For now, return a message that scan is scheduled
      return reply.send({
        message: 'Auto-monitoring scan runs every 2 hours. Next scan will occur soon.',
        note: 'Manual scans are not implemented to avoid rate limiting. Please wait for the scheduled scan.'
      });
    } catch (error: any) {
      fastify.log.error('Error triggering scan:', error);
      return reply.code(500).send({ error: 'Failed to trigger scan' });
    }
  });

  // Remove a specific auto-monitored coin
  fastify.delete(
    '/api/auto-monitoring/coins/:coinId',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { coinId } = request.params as { coinId: string };
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `UPDATE auto_monitored_coins
           SET is_active = false, removed_at = NOW(), removal_reason = 'Manually removed by user'
           WHERE user_id = $1 AND coin_id = $2 AND is_active = true
           RETURNING *`,
          [userId, coinId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Auto-monitored coin not found' });
        }

        return reply.send({
          message: 'Coin removed from auto-monitoring',
          coin: result.rows[0]
        });
      } catch (error: any) {
        fastify.log.error('Error removing auto-monitored coin:', error);
        return reply.code(500).send({ error: 'Failed to remove auto-monitored coin' });
      } finally {
        client.release();
      }
    }
  );
}
