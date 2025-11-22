import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

interface TradingPosition {
  id: number;
  user_id: number;
  signal_id: number;
  coin_id: string;
  coin_symbol: string;
  position_type: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  opened_at: string;
  closed_at: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
  exit_reason: string | null;
  pnl_usd: number | null;
  pnl_percent: number | null;
  tracking: boolean;
  user_feedback: 'GOOD' | 'BAD' | 'NEUTRAL' | null;
  user_rating: number | null;
  user_notes: string | null;
  feedback_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

export async function positionsRoutes(fastify: FastifyInstance) {
  // Get user's trading positions (from active_positions table)
  fastify.get('/api/positions', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { limit = 50, offset = 0, status } = request.query as {
      limit?: number;
      offset?: number;
      status?: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
    };

    const client = await fastify.pg.connect();

    try {
      let query = `SELECT
        id, user_id, signal_id, coin_id, coin_symbol,
        position as position_type, leverage, entry_price, exit_price,
        stop_loss, take_profit, entry_time as opened_at, exit_time as closed_at,
        status, exit_reason, pnl_usd, pnl_percent, tracking,
        user_feedback, user_rating, user_notes, feedback_timestamp,
        created_at, updated_at
      FROM active_positions WHERE user_id = $1`;
      const params: any[] = [userId];

      if (status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY entry_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await client.query<TradingPosition>(query, params);

      return reply.send({ positions: result.rows });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch positions' });
    } finally {
      client.release();
    }
  });

  // Get single position
  fastify.get<{ Params: { id: string } }>(
    '/api/positions/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const client = await fastify.pg.connect();

      try {
        const result = await client.query<TradingPosition>(
          `SELECT
            id, user_id, signal_id, coin_id, coin_symbol,
            position as position_type, leverage, entry_price, exit_price,
            stop_loss, take_profit, entry_time as opened_at, exit_time as closed_at,
            status, exit_reason, pnl_usd, pnl_percent, tracking,
            user_feedback, user_rating, user_notes, feedback_timestamp,
            created_at, updated_at
          FROM active_positions WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Position not found' });
        }

        return reply.send({ position: result.rows[0] });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch position' });
      } finally {
        client.release();
      }
    }
  );

  // Submit feedback for a position
  fastify.post<{
    Params: { id: string };
    Body: {
      user_feedback: 'GOOD' | 'BAD' | 'NEUTRAL';
      user_rating?: number;
      user_notes?: string;
    };
  }>('/api/positions/:id/feedback', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params;
    const { user_feedback, user_rating, user_notes } = request.body;

    // Validate rating if provided
    if (user_rating !== undefined && (user_rating < 1 || user_rating > 5)) {
      return reply.code(400).send({ error: 'Rating must be between 1 and 5' });
    }

    const client = await fastify.pg.connect();

    try {
      const result = await client.query(
        `UPDATE active_positions
         SET user_feedback = $1,
             user_rating = $2,
             user_notes = $3,
             feedback_timestamp = NOW()
         WHERE id = $4 AND user_id = $5
         RETURNING
           id, user_id, signal_id, coin_id, coin_symbol,
           position as position_type, leverage, entry_price, exit_price,
           stop_loss, take_profit, entry_time as opened_at, exit_time as closed_at,
           status, exit_reason, pnl_usd, pnl_percent,
           user_feedback, user_rating, user_notes, feedback_timestamp,
           created_at, updated_at`,
        [user_feedback, user_rating || null, user_notes || null, id, userId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Position not found' });
      }

      fastify.log.info({
        userId,
        positionId: id,
        feedback: user_feedback,
        rating: user_rating,
      }, 'User feedback submitted for position');

      return reply.send({ position: result.rows[0], message: 'Feedback submitted successfully' });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to submit feedback' });
    } finally {
      client.release();
    }
  });

  // Toggle position tracking (for WhatsApp updates)
  fastify.post<{
    Params: { id: string };
    Body: { tracking: boolean };
  }>('/api/positions/:id/tracking', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params;
    const { tracking } = request.body;

    const client = await fastify.pg.connect();

    try {
      const result = await client.query(
        `UPDATE active_positions
         SET tracking = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING
           id, user_id, signal_id, coin_id, coin_symbol,
           position as position_type, leverage, entry_price, exit_price,
           stop_loss, take_profit, entry_time as opened_at, exit_time as closed_at,
           status, exit_reason, pnl_usd, pnl_percent, tracking,
           user_feedback, user_rating, user_notes, feedback_timestamp,
           created_at, updated_at`,
        [tracking, id, userId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Position not found' });
      }

      fastify.log.info({
        userId,
        positionId: id,
        tracking,
      }, `Position tracking ${tracking ? 'enabled' : 'disabled'}`);

      return reply.send({
        position: result.rows[0],
        message: tracking ? 'Position tracking enabled - you will receive WhatsApp updates' : 'Position tracking disabled'
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update tracking' });
    } finally {
      client.release();
    }
  });

  // Manually close a position
  fastify.post<{
    Params: { id: string };
    Body: {
      entry_price?: number;
      exit_price?: number;
      exit_reason?: string;
    };
  }>('/api/positions/:id/close', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params;
    const { entry_price, exit_price, exit_reason } = request.body || {};

    const client = await fastify.pg.connect();

    try {
      // First check if position exists and belongs to user
      const checkResult = await client.query(
        'SELECT * FROM active_positions WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (checkResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Position not found' });
      }

      const position = checkResult.rows[0];

      if (position.status !== 'ACTIVE') {
        return reply.code(400).send({ error: 'Position is already closed' });
      }

      // Use provided entry price or fall back to original
      const finalEntryPrice = entry_price || parseFloat(position.entry_price);
      const finalExitPrice = exit_price || position.current_price || finalEntryPrice;

      // Calculate PnL
      let pnl_usd: number | null = null;
      let pnl_percent: number | null = null;

      if (finalExitPrice && finalEntryPrice) {
        const leverage = position.leverage || 1;

        if (position.position === 'LONG') {
          pnl_percent = ((finalExitPrice - finalEntryPrice) / finalEntryPrice) * 100 * leverage;
        } else {
          pnl_percent = ((finalEntryPrice - finalExitPrice) / finalEntryPrice) * 100 * leverage;
        }

        // Assume $100 position size for USD calculation
        pnl_usd = (pnl_percent / 100) * 100;
      }

      // Update the position to CLOSED (also update entry_price if user corrected it)
      const result = await client.query(
        `UPDATE active_positions
         SET status = 'CLOSED',
             entry_price = $1,
             exit_price = $2,
             exit_time = CURRENT_TIMESTAMP,
             exit_reason = $3,
             pnl_usd = $4,
             pnl_percent = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND user_id = $7
         RETURNING *`,
        [finalEntryPrice, finalExitPrice, exit_reason || 'MANUAL_CLOSE', pnl_usd, pnl_percent, id, userId]
      );

      fastify.log.info({
        userId,
        positionId: id,
        entryPrice: finalEntryPrice,
        exitPrice: finalExitPrice,
        pnl_percent,
        reason: exit_reason || 'MANUAL_CLOSE',
      }, 'Position manually closed');

      return reply.send({
        position: result.rows[0],
        message: 'Position closed successfully',
        pnl: {
          usd: pnl_usd?.toFixed(2) || '0.00',
          percent: pnl_percent?.toFixed(2) || '0.00'
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to close position' });
    } finally {
      client.release();
    }
  });

  // Get position statistics
  fastify.get('/api/positions/stats', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const { days = 30 } = request.query as { days?: number };

    const client = await fastify.pg.connect();

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get overall stats
      const statsResult = await client.query(
        `SELECT
          COUNT(*) as total_positions,
          COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_positions,
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_positions,
          COUNT(CASE WHEN pnl_percent > 0.5 THEN 1 END) as winning_positions,
          COUNT(CASE WHEN pnl_percent < -0.5 THEN 1 END) as losing_positions,
          AVG(CASE WHEN pnl_percent IS NOT NULL THEN pnl_percent END) as avg_pnl_percent,
          SUM(CASE WHEN pnl_usd IS NOT NULL THEN pnl_usd END) as total_pnl_usd,
          COUNT(CASE WHEN user_feedback IS NOT NULL THEN 1 END) as positions_with_feedback,
          AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating END) as avg_user_rating
         FROM active_positions
         WHERE user_id = $1 AND entry_time >= $2`,
        [userId, startDate]
      );

      // Get feedback breakdown
      const feedbackResult = await client.query(
        `SELECT
          user_feedback,
          COUNT(*) as count,
          AVG(user_rating) as avg_rating,
          AVG(pnl_percent) as avg_pnl_percent
         FROM active_positions
         WHERE user_id = $1 AND entry_time >= $2 AND user_feedback IS NOT NULL
         GROUP BY user_feedback`,
        [userId, startDate]
      );

      const stats = statsResult.rows[0];
      const feedbackBreakdown = feedbackResult.rows;

      // Calculate win rate
      const closedPositions = parseInt(stats.closed_positions);
      const winningPositions = parseInt(stats.winning_positions);
      const winRate = closedPositions > 0 ? (winningPositions / closedPositions) * 100 : 0;

      return reply.send({
        period: `Last ${days} days`,
        stats: {
          total_positions: parseInt(stats.total_positions),
          closed_positions: closedPositions,
          active_positions: parseInt(stats.active_positions),
          winning_positions: winningPositions,
          losing_positions: parseInt(stats.losing_positions),
          win_rate: winRate.toFixed(2),
          avg_pnl_percent: parseFloat(stats.avg_pnl_percent || '0').toFixed(2),
          total_pnl_usd: parseFloat(stats.total_pnl_usd || '0').toFixed(2),
          positions_with_feedback: parseInt(stats.positions_with_feedback),
          avg_user_rating: parseFloat(stats.avg_user_rating || '0').toFixed(2),
        },
        feedback_breakdown: feedbackBreakdown.map(fb => ({
          feedback: fb.user_feedback,
          count: parseInt(fb.count),
          avg_rating: parseFloat(fb.avg_rating || '0').toFixed(2),
          avg_pnl_percent: parseFloat(fb.avg_pnl_percent || '0').toFixed(2),
        })),
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch position stats' });
    } finally {
      client.release();
    }
  });
}
