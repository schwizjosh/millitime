import { Pool } from 'pg';
import { cryptoPanicService } from './cryptoPanicService';
import { rssFeedsService } from './rssFeedsService';
import { redditService } from './redditService';
import { lunarCrushService } from './lunarCrushService';

interface NewsArticle {
  source: string;
  article_id: string;
  title: string;
  url: string;
  content: string | null;
  image_url: string | null;
  published_at: Date;
  sentiment: string | null;
  coins_mentioned: string[];
  categories: string[];
  votes: number;
  is_trending: boolean;
}

export class NewsAggregator {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async aggregateAllNews(): Promise<void> {
    console.log('🔄 Starting news aggregation...');
    const startTime = Date.now();

    try {
      // Fetch from all sources in parallel
      const [cryptoPanicNews, cryptoPanicTrending, rssNews, redditHot, redditTop] = await Promise.allSettled([
        cryptoPanicService.fetchLatestNews(),
        cryptoPanicService.fetchTrendingNews(),
        rssFeedsService.fetchAllFeeds(),
        redditService.fetchHotPosts(15),
        redditService.fetchTopPosts('day', 10),
      ]);

      const allArticles: NewsArticle[] = [];

      // Collect all successful results
      if (cryptoPanicNews.status === 'fulfilled') allArticles.push(...cryptoPanicNews.value);
      if (cryptoPanicTrending.status === 'fulfilled') allArticles.push(...cryptoPanicTrending.value);
      if (rssNews.status === 'fulfilled') allArticles.push(...rssNews.value);
      if (redditHot.status === 'fulfilled') allArticles.push(...redditHot.value);
      if (redditTop.status === 'fulfilled') allArticles.push(...redditTop.value);

      console.log(`📰 Collected ${allArticles.length} total articles`);

      // Save to database
      const saved = await this.saveArticles(allArticles);
      console.log(`💾 Saved ${saved} new articles to database`);

      // Update fetch log
      await this.updateFetchLog('news_aggregator', allArticles.length);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ News aggregation completed in ${duration}s`);
    } catch (error: any) {
      console.error('❌ News aggregation failed:', error);
      await this.updateFetchLog('news_aggregator', 0, 'error', error.message);
    }
  }

  async aggregateSocialMetrics(coinSymbols: string[]): Promise<void> {
    console.log(`🔄 Aggregating social metrics for ${coinSymbols.length} coins...`);

    try {
      // Get social metrics from LunarCrush
      const lunarMetrics = await lunarCrushService.getBulkSocialMetrics(coinSymbols);

      // Get Reddit metrics for each coin
      const redditMetrics = await Promise.allSettled(
        coinSymbols.map((symbol) => redditService.getSocialMetrics(symbol))
      );

      // Combine and save metrics
      let savedCount = 0;
      for (let i = 0; i < coinSymbols.length; i++) {
        const symbol = coinSymbols[i];
        const lunar = lunarMetrics.find((m) => m.coin_symbol === symbol);
        const redditResult = redditMetrics[i];
        const reddit = redditResult.status === 'fulfilled' ? redditResult.value : null;

        if (lunar || reddit) {
          await this.saveSocialMetrics(symbol, lunar, reddit);
          savedCount++;
        }
      }

      console.log(`💾 Saved social metrics for ${savedCount} coins`);
    } catch (error: any) {
      console.error('❌ Social metrics aggregation failed:', error);
    }
  }

  private async saveArticles(articles: NewsArticle[]): Promise<number> {
    const client = await this.db.connect();
    let savedCount = 0;

    try {
      await client.query('BEGIN');

      for (const article of articles) {
        try {
          await client.query(
            `INSERT INTO news_articles
            (source, article_id, title, url, content, image_url, published_at, sentiment, coins_mentioned, categories, votes, is_trending)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (source, article_id) DO NOTHING`,
            [
              article.source,
              article.article_id,
              article.title,
              article.url,
              article.content,
              article.image_url,
              article.published_at,
              article.sentiment,
              article.coins_mentioned,
              article.categories,
              article.votes,
              article.is_trending,
            ]
          );
          savedCount++;
        } catch (err: any) {
          // Skip duplicates or errors for individual articles
          if (!err.message.includes('duplicate')) {
            console.error(`Error saving article: ${article.title}`, err.message);
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return savedCount;
  }

  private async saveSocialMetrics(
    coinSymbol: string,
    lunarData: any,
    redditData: any
  ): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query(
        `INSERT INTO social_metrics
        (coin_id, coin_symbol, date, social_volume, social_sentiment, social_contributors, social_dominance,
         galaxy_score, alt_rank, reddit_posts, reddit_comments, reddit_score)
        VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (coin_id, date)
        DO UPDATE SET
          social_volume = EXCLUDED.social_volume,
          social_sentiment = EXCLUDED.social_sentiment,
          social_contributors = EXCLUDED.social_contributors,
          social_dominance = EXCLUDED.social_dominance,
          galaxy_score = EXCLUDED.galaxy_score,
          alt_rank = EXCLUDED.alt_rank,
          reddit_posts = EXCLUDED.reddit_posts,
          reddit_comments = EXCLUDED.reddit_comments,
          reddit_score = EXCLUDED.reddit_score,
          updated_at = CURRENT_TIMESTAMP`,
        [
          coinSymbol.toLowerCase(),
          coinSymbol,
          lunarData?.social_volume || 0,
          lunarData?.social_sentiment || 0,
          lunarData?.social_contributors || 0,
          lunarData?.social_dominance || 0,
          lunarData?.galaxy_score || null,
          lunarData?.alt_rank || null,
          redditData?.posts || 0,
          redditData?.comments || 0,
          redditData?.score || 0,
        ]
      );
    } catch (error: any) {
      console.error(`Error saving social metrics for ${coinSymbol}:`, error.message);
    } finally {
      client.release();
    }
  }

  private async updateFetchLog(
    source: string,
    count: number,
    status: string = 'success',
    errorMessage: string | null = null
  ): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query(
        `INSERT INTO news_fetch_log (source, last_fetch_at, articles_fetched, fetch_status, error_message)
        VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4)
        ON CONFLICT (source)
        DO UPDATE SET
          last_fetch_at = CURRENT_TIMESTAMP,
          articles_fetched = EXCLUDED.articles_fetched,
          fetch_status = EXCLUDED.fetch_status,
          error_message = EXCLUDED.error_message`,
        [source, count, status, errorMessage]
      );
    } finally {
      client.release();
    }
  }

  async cleanOldArticles(daysToKeep: number = 7): Promise<void> {
    const client = await this.db.connect();

    try {
      const result = await client.query(
        `DELETE FROM news_articles
        WHERE published_at < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'`,
      );

      console.log(`🗑️ Cleaned up ${result.rowCount} old articles (older than ${daysToKeep} days)`);
    } finally {
      client.release();
    }
  }
}
