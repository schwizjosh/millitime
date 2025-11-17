import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { BacktestingEngine } from '../services/backtestingEngine';
import { AIProviderService } from '../services/aiProvider';
import { AITradingStrategyService } from '../services/aiTradingStrategy';
import { Backtest } from '../types';

interface RunBacktestBody {
  coin_id: string;
  coin_symbol: string;
  start_date: string;
  end_date: string;
  initial_balance: number;
  risk_percentage?: number;
  use_ai?: boolean;
  use_futures?: boolean;
}

export async function backtestRoutes(fastify: FastifyInstance) {
  // Initialize AI services for backtesting
  let aiStrategy: AITradingStrategyService | undefined;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey || anthropicKey) {
    const aiProvider = new AIProviderService({
      openaiKey,
      anthropicKey,
      preferredProvider: (process.env.AI_PROVIDER as any) || 'auto',
    });
    aiStrategy = new AITradingStrategyService(aiProvider);
  }

  // Run a backtest
  fastify.post<{ Body: RunBacktestBody }>(
    '/api/backtest/run',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const {
        coin_id,
        coin_symbol,
        start_date,
        end_date,
        initial_balance = 10000,
        risk_percentage = 1,
        use_ai = false,
        use_futures = true,
      } = request.body;

      // Validate inputs
      if (!coin_id || !coin_symbol || !start_date || !end_date) {
        return reply.code(400).send({ error: 'Missing required parameters' });
      }

      if (initial_balance <= 0) {
        return reply.code(400).send({ error: 'Initial balance must be positive' });
      }

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (startDate >= endDate) {
        return reply.code(400).send({ error: 'Start date must be before end date' });
      }

      const backtestEngine = new BacktestingEngine(fastify, aiStrategy);

      try {
        fastify.log.info(
          `Running backtest for ${coin_symbol} from ${start_date} to ${end_date}`
        );

        const result = await backtestEngine.runBacktest({
          coinId: coin_id,
          coinSymbol: coin_symbol,
          startDate,
          endDate,
          initialBalance: initial_balance,
          riskPercentage: risk_percentage,
          useAI: use_ai,
          useFutures: use_futures,
        });

        // Save backtest to database
        const backtestId = await backtestEngine.saveBacktest(userId, result);

        return reply.send({
          success: true,
          backtest_id: backtestId,
          result: {
            ...result,
            trades: result.trades.slice(0, 20), // Return first 20 trades
          },
        });
      } catch (error: any) {
        fastify.log.error('Backtest error:', error);
        return reply.code(500).send({ error: error.message || 'Backtest failed' });
      }
    }
  );

  // Get user's backtest history
  fastify.get('/api/backtest/history', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.id;
    const client = await fastify.pg.connect();

    try {
      const result = await client.query<Backtest>(
        `SELECT id, coin_id, coin_symbol, start_date, end_date, initial_balance, final_balance,
                total_trades, winning_trades, losing_trades, win_rate, total_profit_loss,
                profit_loss_percentage, max_drawdown, sharpe_ratio, created_at
         FROM backtests
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      return reply.send({ backtests: result.rows });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch backtest history' });
    } finally {
      client.release();
    }
  });

  // Get specific backtest details
  fastify.get<{ Params: { id: string } }>(
    '/api/backtest/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const backtestId = parseInt(request.params.id);
      const client = await fastify.pg.connect();

      try {
        const result = await client.query<Backtest>(
          `SELECT * FROM backtests
           WHERE id = $1 AND user_id = $2`,
          [backtestId, userId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Backtest not found' });
        }

        return reply.send({ backtest: result.rows[0] });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch backtest details' });
      } finally {
        client.release();
      }
    }
  );

  // Delete a backtest
  fastify.delete<{ Params: { id: string } }>(
    '/api/backtest/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.id;
      const backtestId = parseInt(request.params.id);
      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          `DELETE FROM backtests
           WHERE id = $1 AND user_id = $2`,
          [backtestId, userId]
        );

        if (result.rowCount === 0) {
          return reply.code(404).send({ error: 'Backtest not found' });
        }

        return reply.send({ success: true, message: 'Backtest deleted' });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to delete backtest' });
      } finally {
        client.release();
      }
    }
  );
}
