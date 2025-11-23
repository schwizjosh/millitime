import { FastifyInstance } from 'fastify';
import * as cron from 'node-cron';
import { CoinGeckoService } from './coingecko.js';

interface AutoMonitoringConfig {
  userId: number;
  enableTopGainers: boolean;
  enableTopLosers: boolean;
  gainerThresholdPercent: number;
  loserThresholdPercent: number;
  minVolumeUsd: number;
  topNCount: number;
  enableNewsMonitoring: boolean;
  newsSpikeThreshold: number;
  newsSentimentFilter: string;
  enableNascentTrends: boolean;
  nascentVolumeIncreasePercent: number;
  nascentPriceChangeMin: number;
  nascentUniquenessScore: number;
  hoursBeforeRecheck: number;
  maxMonitoringDays: number;
}

interface CoinMetrics {
  coinId: string;
  coinSymbol: string;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  currentPrice: number;
  newsCount?: number;
  socialVolume?: number;
  trendScore?: number;
}

interface MonitoredCoin {
  id: number;
  userId: number;
  coinId: string;
  coinSymbol: string;
  monitoringReason: string;
  addedAt: Date;
  lastCheckedAt: Date;
  priceChange24h: number;
  volume24h: number;
  newsCount: number;
  socialVolume: number;
  trendScore: number;
  isActive: boolean;
}

export default class AutoMonitoringService {
  private fastify: FastifyInstance;
  private coingeckoService: CoinGeckoService;
  private isRunning = false;
  private scanTask?: cron.ScheduledTask;
  private validationTask?: cron.ScheduledTask;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.coingeckoService = new CoinGeckoService();
  }

  /**
   * Start the auto-monitoring service with scheduled tasks
   */
  start(): void {
    if (this.isRunning) {
      this.fastify.log.warn('AutoMonitoringService is already running');
      return;
    }

    this.fastify.log.info('Starting AutoMonitoringService...');
    this.isRunning = true;

    // Run initial scan on startup (after 1 minute delay)
    setTimeout(() => this.scanForNewCoins(), 60000);

    // Schedule new coin scanning every 2 hours
    this.scanTask = cron.schedule('0 */2 * * *', async () => {
      this.fastify.log.info('Running scheduled auto-monitoring scan');
      await this.scanForNewCoins();
    });

    // Schedule validation check every 6 hours
    this.validationTask = cron.schedule('0 */6 * * *', async () => {
      this.fastify.log.info('Running scheduled monitoring validation');
      await this.validateMonitoredCoins();
    });

    this.fastify.log.info('AutoMonitoringService started successfully');
  }

  /**
   * Stop the auto-monitoring service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.fastify.log.info('Stopping AutoMonitoringService...');
    this.scanTask?.stop();
    this.validationTask?.stop();
    this.isRunning = false;
    this.fastify.log.info('AutoMonitoringService stopped');
  }

  /**
   * Main scan function to discover and monitor new coins
   */
  private async scanForNewCoins(): Promise<void> {
    try {
      this.fastify.log.info('Scanning for new coins to auto-monitor...');

      // Get all users with auto-monitoring enabled
      const users = await this.getEnabledUsers();

      for (const user of users) {
        try {
          await this.scanForUser(user);
        } catch (error: unknown) {
          this.fastify.log.error(error, `Error scanning for user ${user.userId}`);
        }
      }

      this.fastify.log.info('Auto-monitoring scan completed');
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error in scanForNewCoins');
    }
  }

  /**
   * Scan and monitor coins for a specific user
   */
  private async scanForUser(config: AutoMonitoringConfig): Promise<void> {
    const discoveries: Array<{ metrics: CoinMetrics; reason: string }> = [];

    // 1. Discover top gainers
    if (config.enableTopGainers) {
      const gainers = await this.findTopGainers(config);
      discoveries.push(...gainers.map(metrics => ({ metrics, reason: 'top_gainer' })));
    }

    // 2. Discover top losers
    if (config.enableTopLosers) {
      const losers = await this.findTopLosers(config);
      discoveries.push(...losers.map(metrics => ({ metrics, reason: 'top_loser' })));
    }

    // 3. Discover coins with news spikes
    if (config.enableNewsMonitoring) {
      const newsCoins = await this.findNewsBasedCoins(config);
      discoveries.push(...newsCoins.map(metrics => ({ metrics, reason: 'news_spike' })));
    }

    // 4. Discover nascent trends
    if (config.enableNascentTrends) {
      const nascentCoins = await this.findNascentTrends(config);
      discoveries.push(...nascentCoins.map(metrics => ({ metrics, reason: 'nascent_trend' })));
    }

    // Add discovered coins to monitoring
    for (const { metrics, reason } of discoveries) {
      await this.addToMonitoring(config.userId, metrics, reason);
    }

    this.fastify.log.info(`Scanned for user ${config.userId}: found ${discoveries.length} coins to monitor`);
  }

  /**
   * Find top gaining coins in the last 24 hours
   */
  private async findTopGainers(config: AutoMonitoringConfig): Promise<CoinMetrics[]> {
    try {
      this.fastify.log.info('Searching for top gainers...');

      // Fetch top coins by market cap
      const coins = await this.coingeckoService.getTopCoins(250); // Check top 250 coins

      if (!coins || coins.length === 0) {
        return [];
      }

      // Filter and sort gainers
      const gainers = coins
        .filter((coin: any) =>
          coin.price_change_percentage_24h >= config.gainerThresholdPercent &&
          coin.total_volume >= config.minVolumeUsd
        )
        .sort((a: any, b: any) => b.price_change_percentage_24h - a.price_change_percentage_24h)
        .slice(0, config.topNCount)
        .map((coin: any) => ({
          coinId: coin.id,
          coinSymbol: coin.symbol.toUpperCase(),
          priceChange24h: coin.price_change_percentage_24h,
          volume24h: coin.total_volume,
          marketCap: coin.market_cap,
          currentPrice: coin.current_price,
          trendScore: Math.min(100, 70 + coin.price_change_percentage_24h)
        }));

      this.fastify.log.info(`Found ${gainers.length} top gainers`);
      return gainers;
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error finding top gainers');
      return [];
    }
  }

  /**
   * Find top losing coins in the last 24 hours
   */
  private async findTopLosers(config: AutoMonitoringConfig): Promise<CoinMetrics[]> {
    try {
      this.fastify.log.info('Searching for top losers...');

      // Fetch top coins by market cap
      const coins = await this.coingeckoService.getTopCoins(250);

      if (!coins || coins.length === 0) {
        return [];
      }

      // Filter and sort losers (negative price change)
      const losers = coins
        .filter((coin: any) =>
          coin.price_change_percentage_24h <= config.loserThresholdPercent &&
          coin.total_volume >= config.minVolumeUsd
        )
        .sort((a: any, b: any) => a.price_change_percentage_24h - b.price_change_percentage_24h)
        .slice(0, config.topNCount)
        .map((coin: any) => ({
          coinId: coin.id,
          coinSymbol: coin.symbol.toUpperCase(),
          priceChange24h: coin.price_change_percentage_24h,
          volume24h: coin.total_volume,
          marketCap: coin.market_cap,
          currentPrice: coin.current_price,
          trendScore: Math.min(100, 70 + Math.abs(coin.price_change_percentage_24h))
        }));

      this.fastify.log.info(`Found ${losers.length} top losers`);
      return losers;
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error finding top losers');
      return [];
    }
  }

  /**
   * Find coins with significant news coverage
   */
  private async findNewsBasedCoins(config: AutoMonitoringConfig): Promise<CoinMetrics[]> {
    try {
      this.fastify.log.info('Searching for coins with news spikes...');

      // Query news_articles table for coins with recent news mentions
      const result = await this.fastify.pg.query(`
        SELECT
          unnest(coins_mentioned) as coin_symbol,
          COUNT(*) as news_count,
          AVG(CASE
            WHEN sentiment = 'positive' THEN 1
            WHEN sentiment = 'negative' THEN -1
            ELSE 0
          END) as avg_sentiment
        FROM news_articles
        WHERE published_at > NOW() - INTERVAL '24 hours'
          AND coins_mentioned IS NOT NULL
          AND array_length(coins_mentioned, 1) > 0
        GROUP BY coin_symbol
        HAVING COUNT(*) >= $1
        ORDER BY news_count DESC
        LIMIT 20
      `, [config.newsSpikeThreshold]);

      const newsCoins: CoinMetrics[] = [];

      for (const row of result.rows) {
        // Filter by sentiment if configured
        if (config.newsSentimentFilter === 'positive' && row.avg_sentiment < 0) continue;
        if (config.newsSentimentFilter === 'negative' && row.avg_sentiment > 0) continue;

        try {
          // Get current price data for the coin
          const searchResult = await this.coingeckoService.searchCoins(row.coin_symbol);
          const coinData = searchResult.coins;
          if (!coinData || coinData.length === 0) continue;

          const coin = coinData[0];
          const markets = await this.coingeckoService.getCoinsMarkets([coin.id]);

          if (markets && markets.length > 0) {
            const market = markets[0];
            newsCoins.push({
              coinId: coin.id,
              coinSymbol: row.coin_symbol.toUpperCase(),
              priceChange24h: market.price_change_percentage_24h || 0,
              volume24h: market.total_volume || 0,
              marketCap: market.market_cap || 0,
              currentPrice: market.current_price,
              newsCount: parseInt(row.news_count),
              trendScore: Math.min(100, 60 + parseInt(row.news_count) * 5)
            });
          }
        } catch (error: unknown) {
          this.fastify.log.error(error, `Error fetching data for ${row.coin_symbol}`);
        }
      }

      this.fastify.log.info(`Found ${newsCoins.length} coins with news spikes`);
      return newsCoins;
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error finding news-based coins');
      return [];
    }
  }

  /**
   * Find coins with early nascent trends (unique patterns)
   */
  private async findNascentTrends(config: AutoMonitoringConfig): Promise<CoinMetrics[]> {
    try {
      this.fastify.log.info('Searching for nascent trends...');

      // Get coins with recent volume and price increases
      const coins = await this.coingeckoService.getTopCoins(200);

      if (!coins || coins.length === 0) {
        return [];
      }

      const nascentCoins: CoinMetrics[] = [];

      for (const coin of coins) {
        try {
          // Check if coin meets nascent trend criteria
          const meetsVolumeCriteria = coin.price_change_percentage_24h >= config.nascentPriceChangeMin &&
                                       coin.price_change_percentage_24h < 30; // Not already mainstream

          if (!meetsVolumeCriteria) continue;

          // Calculate uniqueness score based on multiple factors
          const volumeToMcapRatio = coin.total_volume / coin.market_cap;
          const priceChange = coin.price_change_percentage_24h;

          // Nascent trends: moderate price change with high volume relative to market cap
          const uniquenessScore = this.calculateUniquenessScore(
            priceChange,
            volumeToMcapRatio,
            coin.market_cap
          );

          if (uniquenessScore >= config.nascentUniquenessScore) {
            nascentCoins.push({
              coinId: coin.id,
              coinSymbol: coin.symbol.toUpperCase(),
              priceChange24h: coin.price_change_percentage_24h,
              volume24h: coin.total_volume,
              marketCap: coin.market_cap,
              currentPrice: coin.current_price,
              trendScore: uniquenessScore
            });
          }
        } catch (error: unknown) {
          this.fastify.log.error(error, `Error analyzing ${coin.symbol}:`);
        }
      }

      // Sort by uniqueness score and take top coins
      nascentCoins.sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0));
      const topNascent = nascentCoins.slice(0, config.topNCount);

      this.fastify.log.info(`Found ${topNascent.length} nascent trends`);
      return topNascent;
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error finding nascent trends');
      return [];
    }
  }

  /**
   * Calculate uniqueness score for nascent trend detection
   */
  private calculateUniquenessScore(
    priceChange: number,
    volumeToMcapRatio: number,
    marketCap: number
  ): number {
    let score = 50;

    // Price change contribution (5-30% is ideal for nascent)
    if (priceChange >= 5 && priceChange <= 30) {
      score += Math.min(25, priceChange);
    }

    // Volume/Market Cap ratio contribution (high volume relative to cap)
    if (volumeToMcapRatio > 0.2) {
      score += Math.min(30, volumeToMcapRatio * 100);
    }

    // Prefer smaller to mid-cap coins for nascent trends (more room to grow)
    if (marketCap < 1000000000) { // < $1B
      score += 15;
    } else if (marketCap < 10000000000) { // < $10B
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Add a coin to auto-monitoring for a user
   */
  private async addToMonitoring(
    userId: number,
    metrics: CoinMetrics,
    reason: string
  ): Promise<void> {
    try {
      // Check if already monitoring
      const existing = await this.fastify.pg.query(
        `SELECT id FROM auto_monitored_coins
         WHERE user_id = $1 AND coin_id = $2 AND monitoring_reason = $3 AND is_active = true`,
        [userId, metrics.coinId, reason]
      );

      if (existing.rows.length > 0) {
        // Already monitoring, just update metrics
        await this.fastify.pg.query(
          `UPDATE auto_monitored_coins
           SET price_change_24h = $1, volume_24h = $2, news_count = $3,
               social_volume = $4, trend_score = $5, last_checked_at = NOW()
           WHERE user_id = $6 AND coin_id = $7 AND monitoring_reason = $8 AND is_active = true`,
          [
            metrics.priceChange24h,
            metrics.volume24h,
            metrics.newsCount || 0,
            metrics.socialVolume || 0,
            metrics.trendScore || 0,
            userId,
            metrics.coinId,
            reason
          ]
        );
        return;
      }

      // Add new monitoring entry
      await this.fastify.pg.query(
        `INSERT INTO auto_monitored_coins
         (user_id, coin_id, coin_symbol, monitoring_reason, price_change_24h, volume_24h,
          news_count, social_volume, trend_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, coin_id, monitoring_reason)
         DO UPDATE SET
           is_active = true,
           removed_at = NULL,
           removal_reason = NULL,
           price_change_24h = EXCLUDED.price_change_24h,
           volume_24h = EXCLUDED.volume_24h,
           news_count = EXCLUDED.news_count,
           social_volume = EXCLUDED.social_volume,
           trend_score = EXCLUDED.trend_score,
           last_checked_at = NOW()`,
        [
          userId,
          metrics.coinId,
          metrics.coinSymbol,
          reason,
          metrics.priceChange24h,
          metrics.volume24h,
          metrics.newsCount || 0,
          metrics.socialVolume || 0,
          metrics.trendScore || 0
        ]
      );

      // Also add to watchlist if not already there
      await this.fastify.pg.query(
        `INSERT INTO watchlist (user_id, coin_id, coin_symbol, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (user_id, coin_id)
         DO UPDATE SET is_active = true`,
        [userId, metrics.coinId, metrics.coinSymbol]
      );

      // Log the action
      await this.logAction(userId, metrics.coinId, metrics.coinSymbol, 'added', reason, {
        priceChange24h: metrics.priceChange24h,
        volume24h: metrics.volume24h,
        trendScore: metrics.trendScore
      });

      this.fastify.log.info(
        `Auto-monitoring added: ${metrics.coinSymbol} for user ${userId} (${reason})`
      );
    } catch (error: unknown) {
      this.fastify.log.error(error, `Error adding ${metrics.coinSymbol} to monitoring:`);
    }
  }

  /**
   * Validate all monitored coins and remove those that no longer meet criteria
   */
  private async validateMonitoredCoins(): Promise<void> {
    try {
      this.fastify.log.info('Validating monitored coins...');

      // Get all active auto-monitored coins that need checking
      const result = await this.fastify.pg.query<MonitoredCoin>(`
        SELECT amc.*, aconfig.hours_before_recheck, aconfig.max_monitoring_days
        FROM auto_monitored_coins amc
        JOIN auto_monitoring_config aconfig ON amc.user_id = aconfig.user_id
        WHERE amc.is_active = true
          AND (
            amc.last_checked_at < NOW() - (aconfig.hours_before_recheck || ' hours')::INTERVAL
            OR amc.added_at < NOW() - (aconfig.max_monitoring_days || ' days')::INTERVAL
          )
      `);

      for (const coin of result.rows) {
        await this.validateCoin(coin);
      }

      this.fastify.log.info(`Validated ${result.rows.length} coins`);
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error validating monitored coins');
    }
  }

  /**
   * Validate a single coin against its monitoring criteria
   */
  private async validateCoin(coin: MonitoredCoin): Promise<void> {
    try {
      // Check if exceeded max monitoring days
      const daysSinceAdded = (Date.now() - new Date(coin.addedAt).getTime()) / (1000 * 60 * 60 * 24);

      const config = await this.getUserConfig(coin.userId);
      if (!config) return;

      if (daysSinceAdded > config.maxMonitoringDays) {
        await this.removeFromMonitoring(
          coin.userId,
          coin.coinId,
          coin.coinSymbol,
          `Exceeded maximum monitoring period of ${config.maxMonitoringDays} days`
        );
        return;
      }

      // Get current metrics
      const markets = await this.coingeckoService.getCoinsMarkets([coin.coinId]);
      if (!markets || markets.length === 0) {
        await this.removeFromMonitoring(
          coin.userId,
          coin.coinId,
          coin.coinSymbol,
          'Unable to fetch current market data'
        );
        return;
      }

      const currentMetrics = markets[0];
      let stillMeetsCriteria = false;
      let reason = '';

      // Check based on monitoring reason
      switch (coin.monitoringReason) {
        case 'top_gainer':
          stillMeetsCriteria =
            currentMetrics.price_change_percentage_24h >= config.gainerThresholdPercent &&
            currentMetrics.total_volume >= config.minVolumeUsd;
          reason = `Price change: ${currentMetrics.price_change_percentage_24h.toFixed(2)}%, Volume: $${currentMetrics.total_volume.toFixed(0)}`;
          break;

        case 'top_loser':
          stillMeetsCriteria =
            currentMetrics.price_change_percentage_24h <= config.loserThresholdPercent &&
            currentMetrics.total_volume >= config.minVolumeUsd;
          reason = `Price change: ${currentMetrics.price_change_percentage_24h.toFixed(2)}%, Volume: $${currentMetrics.total_volume.toFixed(0)}`;
          break;

        case 'news_spike':
          // Check recent news count
          const newsResult = await this.fastify.pg.query(
            `SELECT COUNT(*) as count FROM news_articles
             WHERE published_at > NOW() - INTERVAL '24 hours'
               AND $1 = ANY(coins_mentioned)`,
            [coin.coinSymbol]
          );
          const newsCount = parseInt(newsResult.rows[0]?.count || '0');
          stillMeetsCriteria = newsCount >= config.newsSpikeThreshold;
          reason = `Current news count: ${newsCount}`;
          break;

        case 'nascent_trend':
          const volumeToMcapRatio = currentMetrics.total_volume / currentMetrics.market_cap;
          const uniquenessScore = this.calculateUniquenessScore(
            currentMetrics.price_change_percentage_24h,
            volumeToMcapRatio,
            currentMetrics.market_cap
          );
          stillMeetsCriteria = uniquenessScore >= config.nascentUniquenessScore;
          reason = `Uniqueness score: ${uniquenessScore.toFixed(2)}`;
          break;
      }

      if (stillMeetsCriteria) {
        // Update metrics and last checked time
        await this.fastify.pg.query(
          `UPDATE auto_monitored_coins
           SET price_change_24h = $1, volume_24h = $2, last_checked_at = NOW()
           WHERE id = $3`,
          [currentMetrics.price_change_percentage_24h, currentMetrics.total_volume, coin.id]
        );

        await this.logAction(
          coin.userId,
          coin.coinId,
          coin.coinSymbol,
          'revalidated',
          `Still meets ${coin.monitoringReason} criteria: ${reason}`,
          { currentMetrics }
        );
      } else {
        await this.removeFromMonitoring(
          coin.userId,
          coin.coinId,
          coin.coinSymbol,
          `No longer meets ${coin.monitoringReason} criteria: ${reason}`
        );
      }
    } catch (error: unknown) {
      this.fastify.log.error(error, `Error validating coin ${coin.coinSymbol}:`);
    }
  }

  /**
   * Remove a coin from auto-monitoring
   */
  private async removeFromMonitoring(
    userId: number,
    coinId: string,
    coinSymbol: string,
    reason: string
  ): Promise<void> {
    try {
      // Mark as inactive
      await this.fastify.pg.query(
        `UPDATE auto_monitored_coins
         SET is_active = false, removed_at = NOW(), removal_reason = $1
         WHERE user_id = $2 AND coin_id = $3 AND is_active = true`,
        [reason, userId, coinId]
      );

      // Also remove from watchlist (only if not manually added)
      await this.fastify.pg.query(
        `UPDATE watchlist SET is_active = false
         WHERE user_id = $1 AND coin_id = $2`,
        [userId, coinId]
      );

      // Log the action
      await this.logAction(userId, coinId, coinSymbol, 'removed', reason, {});

      this.fastify.log.info(
        `Auto-monitoring removed: ${coinSymbol} for user ${userId} - ${reason}`
      );
    } catch (error: unknown) {
      this.fastify.log.error(error, `Error removing ${coinSymbol} from monitoring:`);
    }
  }

  /**
   * Get users with auto-monitoring enabled
   */
  private async getEnabledUsers(): Promise<AutoMonitoringConfig[]> {
    const result = await this.fastify.pg.query<AutoMonitoringConfig>(`
      SELECT
        user_id as "userId",
        enable_top_gainers as "enableTopGainers",
        enable_top_losers as "enableTopLosers",
        gainer_threshold_percent as "gainerThresholdPercent",
        loser_threshold_percent as "loserThresholdPercent",
        min_volume_usd as "minVolumeUsd",
        top_n_count as "topNCount",
        enable_news_monitoring as "enableNewsMonitoring",
        news_spike_threshold as "newsSpikeThreshold",
        news_sentiment_filter as "newsSentimentFilter",
        enable_nascent_trends as "enableNascentTrends",
        nascent_volume_increase_percent as "nascentVolumeIncreasePercent",
        nascent_price_change_min as "nascentPriceChangeMin",
        nascent_uniqueness_score as "nascentUniquenessScore",
        hours_before_recheck as "hoursBeforeRecheck",
        max_monitoring_days as "maxMonitoringDays"
      FROM auto_monitoring_config
      WHERE enable_top_gainers = true
         OR enable_top_losers = true
         OR enable_news_monitoring = true
         OR enable_nascent_trends = true
    `);

    return result.rows;
  }

  /**
   * Get config for a specific user
   */
  private async getUserConfig(userId: number): Promise<AutoMonitoringConfig | null> {
    const result = await this.fastify.pg.query<AutoMonitoringConfig>(`
      SELECT
        user_id as "userId",
        enable_top_gainers as "enableTopGainers",
        enable_top_losers as "enableTopLosers",
        gainer_threshold_percent as "gainerThresholdPercent",
        loser_threshold_percent as "loserThresholdPercent",
        min_volume_usd as "minVolumeUsd",
        top_n_count as "topNCount",
        enable_news_monitoring as "enableNewsMonitoring",
        news_spike_threshold as "newsSpikeThreshold",
        news_sentiment_filter as "newsSentimentFilter",
        enable_nascent_trends as "enableNascentTrends",
        nascent_volume_increase_percent as "nascentVolumeIncreasePercent",
        nascent_price_change_min as "nascentPriceChangeMin",
        nascent_uniqueness_score as "nascentUniquenessScore",
        hours_before_recheck as "hoursBeforeRecheck",
        max_monitoring_days as "maxMonitoringDays"
      FROM auto_monitoring_config
      WHERE user_id = $1
    `, [userId]);

    return result.rows[0] || null;
  }

  /**
   * Log an auto-monitoring action
   */
  private async logAction(
    userId: number,
    coinId: string,
    coinSymbol: string,
    action: string,
    reason: string,
    metadata: any
  ): Promise<void> {
    try {
      await this.fastify.pg.query(
        `INSERT INTO auto_monitoring_log (user_id, coin_id, coin_symbol, action, reason, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, coinId, coinSymbol, action, reason, JSON.stringify(metadata)]
      );
    } catch (error: unknown) {
      this.fastify.log.error(error, 'Error logging action');
    }
  }

  /**
   * Get auto-monitored coins for a user
   */
  async getAutoMonitoredCoins(userId: number): Promise<any[]> {
    const result = await this.fastify.pg.query(`
      SELECT
        amc.*,
        w.last_notification_sent,
        COUNT(s.id) as signal_count
      FROM auto_monitored_coins amc
      LEFT JOIN watchlist w ON amc.user_id = w.user_id AND amc.coin_id = w.coin_id
      LEFT JOIN signals s ON amc.coin_id = s.coin_id AND amc.user_id = s.user_id
        AND s.created_at > amc.added_at
      WHERE amc.user_id = $1 AND amc.is_active = true
      GROUP BY amc.id, w.last_notification_sent
      ORDER BY amc.added_at DESC
    `, [userId]);

    return result.rows;
  }

  /**
   * Get auto-monitoring logs for a user
   */
  async getAutoMonitoringLogs(userId: number, limit: number = 100): Promise<any[]> {
    const result = await this.fastify.pg.query(`
      SELECT * FROM auto_monitoring_log
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  }

  /**
   * Update auto-monitoring config for a user
   */
  async updateConfig(userId: number, config: Partial<AutoMonitoringConfig>): Promise<void> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic update query
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && key !== 'userId') {
        // Convert camelCase to snake_case
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        fields.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return;

    values.push(userId);
    await this.fastify.pg.query(
      `UPDATE auto_monitoring_config
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE user_id = $${paramIndex}`,
      values
    );
  }
}
