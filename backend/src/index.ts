import Fastify from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import dotenv from 'dotenv';
import { authRoutes } from './routes/auth';
import { watchlistRoutes } from './routes/watchlist';
import { signalsRoutes } from './routes/signals';
import { SignalGenerator } from './services/signalGenerator';

dotenv.config();

const fastify = Fastify({
  logger: true
});

// Register CORS
fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
});

// Register PostgreSQL
fastify.register(postgres, {
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/millitime'
});

// Health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API routes
fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello from Crypto Signals Bot!' };
});

// Example database query route
fastify.get('/api/test-db', async (request, reply) => {
  const client = await fastify.pg.connect();
  try {
    const { rows } = await client.query('SELECT NOW() as now');
    return { database_time: rows[0].now };
  } catch (error) {
    reply.code(500);
    return { error: 'Database connection failed' };
  } finally {
    client.release();
  }
});

// Register routes
fastify.register(authRoutes);
fastify.register(watchlistRoutes);
fastify.register(signalsRoutes);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);

    // Start signal generator
    const signalGenerator = new SignalGenerator(fastify);
    signalGenerator.start();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
