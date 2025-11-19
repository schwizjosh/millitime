import { FastifyInstance } from 'fastify';
import { NewsAggregator } from './newsAggregator';

export class NewsAggregationService {
  private fastify: FastifyInstance;
  private newsAggregator: NewsAggregator;
  private newsInterval: NodeJS.Timeout | null = null;
  private socialInterval: NodeJS.Timeout | null = null;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.newsAggregator = new NewsAggregator(fastify.pg.pool);
  }

  start(): void {
    console.log('📰 News Aggregation Service starting...');

    // Run immediately on startup
    this.aggregateNews();
    this.aggregateSocialMetrics();

    // Schedule news aggregation every 15 minutes
    this.newsInterval = setInterval(() => {
      this.aggregateNews();
    }, 15 * 60 * 1000);

    // Schedule social metrics aggregation every 1 hour
    this.socialInterval = setInterval(() => {
      this.aggregateSocialMetrics();
    }, 60 * 60 * 1000);

    // Clean up old articles daily at 3 AM
    this.scheduleDailyCleanup();

    console.log('✅ News Aggregation Service started');
    console.log('   - News aggregation: every 15 minutes');
    console.log('   - Social metrics: every 1 hour');
    console.log('   - Cleanup: daily at 3:00 AM');
  }

  stop(): void {
    if (this.newsInterval) {
      clearInterval(this.newsInterval);
      this.newsInterval = null;
    }

    if (this.socialInterval) {
      clearInterval(this.socialInterval);
      this.socialInterval = null;
    }

    console.log('News Aggregation Service stopped');
  }

  private async aggregateNews(): Promise<void> {
    try {
      await this.newsAggregator.aggregateAllNews();
    } catch (error: any) {
      console.error('News aggregation error:', error.message);
    }
  }

  private async aggregateSocialMetrics(): Promise<void> {
    try {
      // Get all unique active coins from watchlists
      const client = await this.fastify.pg.pool.connect();
      try {
        const result = await client.query(
          'SELECT DISTINCT coin_symbol FROM watchlist WHERE is_active = true'
        );

        const coinSymbols = result.rows.map((row) => row.coin_symbol);

        if (coinSymbols.length > 0) {
          await this.newsAggregator.aggregateSocialMetrics(coinSymbols);
        }
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Social metrics aggregation error:', error.message);
    }
  }

  private scheduleDailyCleanup(): void {
    // Calculate time until next 3 AM
    const now = new Date();
    const next3AM = new Date();
    next3AM.setHours(3, 0, 0, 0);

    if (next3AM <= now) {
      // If it's past 3 AM today, schedule for tomorrow
      next3AM.setDate(next3AM.getDate() + 1);
    }

    const msUntil3AM = next3AM.getTime() - now.getTime();

    setTimeout(() => {
      this.cleanupOldArticles();

      // Repeat every 24 hours
      setInterval(() => {
        this.cleanupOldArticles();
      }, 24 * 60 * 60 * 1000);
    }, msUntil3AM);
  }

  private async cleanupOldArticles(): Promise<void> {
    try {
      await this.newsAggregator.cleanOldArticles(7); // Keep 7 days
    } catch (error: any) {
      console.error('Article cleanup error:', error.message);
    }
  }
}
