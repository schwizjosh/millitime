import Fastify from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import dotenv from 'dotenv';
import { authRoutes } from './routes/auth';
import { watchlistRoutes } from './routes/watchlist';
import { signalsRoutes } from './routes/signals';
import { tradingRoutes } from './routes/trading';
import { spotlightRoutes } from './routes/spotlight';
import { backtestRoutes } from './routes/backtest';
import { newsRoutes } from './routes/news';
import aiUsageRoutes from './routes/ai-usage';
import { positionsRoutes } from './routes/positions';
import { mlRoutes } from './routes/ml';
import { SignalGenerator } from './services/signalGenerator';
import { AISignalGenerator } from './services/aiSignalGenerator';
import { SpotlightCoinsDiscoveryService } from './services/spotlightCoinsDiscovery';
import { ExchangeIntegrationService } from './services/exchangeIntegration';
import { AIProviderService } from './services/aiProvider';
import { NewsAggregationService } from './services/newsAggregationService';

dotenv.config();

console.log('Environment loaded:', {
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT,
  JWT_SECRET: process.env.JWT_SECRET ? '***set***' : 'undefined',
  AI_ENABLED: process.env.ENABLE_AI_ANALYSIS !== 'false',
  GEMINI_KEY: process.env.GEMINI_API_KEY ? '***set***' : 'not set',
  OPENAI_KEY: process.env.OPENAI_API_KEY ? '***set***' : 'not set',
  ANTHROPIC_KEY: process.env.ANTHROPIC_API_KEY ? '***set***' : 'not set',
  AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
});

const fastify = Fastify({
  logger: true
});

// Register CORS
fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
});

const dbConnectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/millitime';
console.log('Using DATABASE_URL:', dbConnectionString);

// Register PostgreSQL
fastify.register(postgres, {
  connectionString: dbConnectionString
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
fastify.register(tradingRoutes);
fastify.register(spotlightRoutes);
fastify.register(backtestRoutes);
fastify.register(newsRoutes);
fastify.register(positionsRoutes);
fastify.register(mlRoutes);

// Initialize AI provider globally for usage stats endpoint
let globalAIProvider: AIProviderService | undefined;
if (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
  // Parse multiple Gemini keys if provided (comma-separated)
  const geminiKeys = process.env.GEMINI_API_KEYS
    ? process.env.GEMINI_API_KEYS.split(',').map(key => key.trim()).filter(key => key.length > 0)
    : undefined;

  globalAIProvider = new AIProviderService({
    geminiKeys: geminiKeys,
    geminiKey: !geminiKeys ? process.env.GEMINI_API_KEY : undefined, // Fallback to single key
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    preferredProvider: (process.env.AI_PROVIDER as any) || 'auto',
  });
}

// Register AI usage stats route
fastify.register(aiUsageRoutes, { aiProvider: globalAIProvider });

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);

    // Start AI-enhanced signal generator (falls back to technical-only if no AI keys)
    const useAI = process.env.ENABLE_AI_ANALYSIS !== 'false' &&
                  (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

    if (useAI) {
      console.log('🤖 Starting AI-Enhanced Signal Generator...');
      const aiSignalGenerator = new AISignalGenerator(fastify);
      aiSignalGenerator.start();
    } else {
      console.log('📊 Starting Technical Analysis Signal Generator...');
      const signalGenerator = new SignalGenerator(fastify);
      signalGenerator.start();
    }

    // Start Exchange Integration Service
    console.log('🏦 Starting Exchange Integration Service...');
    const exchangeService = new ExchangeIntegrationService(fastify);
    exchangeService.start();

    // Start Spotlight Coins Discovery Service
    console.log('🔍 Starting Spotlight Coins Discovery Service...');
    const spotlightService = new SpotlightCoinsDiscoveryService(fastify, globalAIProvider);
    spotlightService.start();

    // Start News Aggregation Service
    console.log('📰 Starting News Aggregation Service...');
    const newsService = new NewsAggregationService(fastify);
    newsService.start();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
