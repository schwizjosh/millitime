/**
 * Spotlight Coins Discovery Service
 * Performs daily fundamental analysis searches to discover trending coins
 * Uses multiple sources: CoinGecko trending, social sentiment, and AI-powered analysis
 */

import { FastifyInstance } from 'fastify';
import { coingeckoService } from './coingecko';
import { AIProviderService } from './aiProvider';
import axios from 'axios';
import cron from 'node-cron';

export interface DiscoveredCoin {
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  source: string;
  market_cap?: number;
  volume_24h?: number;
  price_change_24h?: number;
  trending_score: number;
  description?: string;
  metadata?: Record<string, any>;
}

export class SpotlightCoinsDiscoveryService {
  private fastify: FastifyInstance;
  private aiProvider: AIProviderService | null = null;
  private isRunning = false;

  constructor(fastify: FastifyInstance, aiProvider?: AIProviderService) {
    this.fastify = fastify;
    this.aiProvider = aiProvider || null;
  }

  /**
   * Start daily discovery cron job
   * Runs every day at 00:00 UTC
   */
  start() {
    if (this.isRunning) {
      this.fastify.log.info('Spotlight coins discovery is already running');
      return;
    }

    // Run daily at midnight UTC
    cron.schedule('0 0 * * *', async () => {
      this.fastify.log.info('Running daily spotlight coins discovery...');
      await this.discoverCoins();
    });

    // Also run on startup
    this.discoverCoins();

    this.isRunning = true;
    this.fastify.log.info('Spotlight coins discovery service started');
  }

  /**
   * Main discovery method - aggregates coins from multiple sources
   */
  async discoverCoins(): Promise<DiscoveredCoin[]> {
    const client = await this.fastify.pg.connect();
    const discoveredCoins: DiscoveredCoin[] = [];

    try {
      // 1. Get CoinGecko trending coins
      const trendingCoins = await this.getCoinGeckoTrending();
      discoveredCoins.push(...trendingCoins);

      // 2. Get top gainers (24h price change)
      const gainers = await this.getTopGainers();
      discoveredCoins.push(...gainers);

      // 3. Get high volume coins (potential breakouts)
      const highVolumeCoins = await this.getHighVolumeCoins();
      discoveredCoins.push(...highVolumeCoins);

      // 4. AI-powered news sentiment analysis (if available)
      if (this.aiProvider) {
        const newsCoins = await this.getNewsBasedCoins();
        discoveredCoins.push(...newsCoins);
      }

      // Remove duplicates and sort by trending score
      const uniqueCoins = this.deduplicateAndScore(discoveredCoins);

      // Store in database
      for (const coin of uniqueCoins) {
        await client.query(
          `INSERT INTO spotlight_coins
           (coin_id, coin_symbol, coin_name, source, market_cap, volume_24h,
            price_change_24h, trending_score, description, metadata, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
           ON CONFLICT (coin_id, discovery_date)
           DO UPDATE SET
             trending_score = GREATEST(spotlight_coins.trending_score, $8),
             metadata = $10,
             is_active = true`,
          [
            coin.coin_id,
            coin.coin_symbol,
            coin.coin_name,
            coin.source,
            coin.market_cap,
            coin.volume_24h,
            coin.price_change_24h,
            coin.trending_score,
            coin.description,
            JSON.stringify(coin.metadata),
          ]
        );
      }

      // Log discovery
      await client.query(
        `INSERT INTO fa_discovery_log
         (search_date, coins_discovered, sources_checked, metadata)
         VALUES (CURRENT_DATE, $1, $2, $3)`,
        [
          uniqueCoins.length,
          ['coingecko_trending', 'top_gainers', 'high_volume', 'ai_news'],
          JSON.stringify({ timestamp: new Date().toISOString() }),
        ]
      );

      this.fastify.log.info(`Discovered ${uniqueCoins.length} spotlight coins`);
      return uniqueCoins;
    } catch (error: any) {
      this.fastify.log.error('Error discovering spotlight coins:', error);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Get trending coins from CoinGecko
   */
  private async getCoinGeckoTrending(): Promise<DiscoveredCoin[]> {
    try {
      const trending = await coingeckoService.getTrending();
      const coins: DiscoveredCoin[] = [];

      for (const item of trending.coins || []) {
        const coin = item.item;
        coins.push({
          coin_id: coin.id,
          coin_symbol: coin.symbol,
          coin_name: coin.name,
          source: 'coingecko_trending',
          market_cap: coin.market_cap_rank,
          trending_score: 80 + (7 - (coin.market_cap_rank || 0)) * 2, // Higher score for top trending
          description: `Trending #${coin.market_cap_rank || 'N/A'} on CoinGecko`,
          metadata: {
            price_btc: coin.price_btc,
            thumb: coin.thumb,
            score: coin.score,
          },
        });
      }

      return coins;
    } catch (error) {
      this.fastify.log.error('Error fetching CoinGecko trending:', error);
      return [];
    }
  }

  /**
   * Get top gainers (24h price change > 20%)
   */
  private async getTopGainers(): Promise<DiscoveredCoin[]> {
    try {
      const topCoins = await coingeckoService.getTopCoins(250);
      const gainers: DiscoveredCoin[] = [];

      for (const coin of topCoins) {
        // Filter for significant price changes
        if (coin.price_change_percentage_24h > 15 && coin.total_volume > 1000000) {
          const score = Math.min(
            95,
            70 + coin.price_change_percentage_24h // Higher gain = higher score
          );

          gainers.push({
            coin_id: coin.id,
            coin_symbol: coin.symbol,
            coin_name: coin.name,
            source: 'top_gainers',
            market_cap: coin.market_cap,
            volume_24h: coin.total_volume,
            price_change_24h: coin.price_change_percentage_24h,
            trending_score: score,
            description: `Up ${coin.price_change_percentage_24h.toFixed(1)}% in 24h`,
            metadata: {
              current_price: coin.current_price,
              ath_change_percentage: coin.ath_change_percentage,
            },
          });
        }
      }

      return gainers.sort((a, b) => b.trending_score - a.trending_score).slice(0, 20);
    } catch (error) {
      this.fastify.log.error('Error fetching top gainers:', error);
      return [];
    }
  }

  /**
   * Get high volume coins (volume spike indicates interest)
   */
  private async getHighVolumeCoins(): Promise<DiscoveredCoin[]> {
    try {
      const topCoins = await coingeckoService.getTopCoins(250);
      const highVolumeCoins: DiscoveredCoin[] = [];

      for (const coin of topCoins) {
        // Volume/Market Cap ratio > 0.5 indicates high trading activity
        const volumeRatio = coin.total_volume / (coin.market_cap || 1);

        if (volumeRatio > 0.3 && coin.total_volume > 5000000) {
          const score = Math.min(90, 60 + volumeRatio * 50);

          highVolumeCoins.push({
            coin_id: coin.id,
            coin_symbol: coin.symbol,
            coin_name: coin.name,
            source: 'high_volume',
            market_cap: coin.market_cap,
            volume_24h: coin.total_volume,
            price_change_24h: coin.price_change_percentage_24h,
            trending_score: score,
            description: `High volume activity (${(volumeRatio * 100).toFixed(0)}% of market cap)`,
            metadata: {
              volume_ratio: volumeRatio,
              current_price: coin.current_price,
            },
          });
        }
      }

      return highVolumeCoins.sort((a, b) => b.trending_score - a.trending_score).slice(0, 15);
    } catch (error) {
      this.fastify.log.error('Error fetching high volume coins:', error);
      return [];
    }
  }

  /**
   * AI-powered news and sentiment analysis
   * Uses AI to analyze crypto news and identify promising coins
   */
  private async getNewsBasedCoins(): Promise<DiscoveredCoin[]> {
    if (!this.aiProvider) {
      return [];
    }

    try {
      // Fetch recent crypto news headlines (you would integrate with a news API here)
      // For now, we'll use a simple approach with CoinGecko's trending as proxy

      const trending = await coingeckoService.getTrending();
      const newsCoins: DiscoveredCoin[] = [];

      // Use AI to analyze trending coins
      if (trending.coins && trending.coins.length > 0) {
        const coinNames = trending.coins.slice(0, 10).map((c: any) => c.item.name);

        const aiAnalysis = await this.aiProvider.complete(
          [
            {
              role: 'system',
              content:
                'You are a crypto market analyst. Analyze trending coins and identify the top 3 most promising based on fundamentals. Format: SYMBOL|SCORE(0-100)|REASON',
            },
            {
              role: 'user',
              content: `Trending coins: ${coinNames.join(', ')}. Which are most promising?`,
            },
          ],
          { maxTokens: 300, taskComplexity: 'simple' }
        );

        // Parse AI response (simplified)
        const lines = aiAnalysis.content.split('\n').filter((l) => l.trim());
        for (const line of lines.slice(0, 3)) {
          const match = trending.coins.find((c: any) =>
            line.toUpperCase().includes(c.item.symbol.toUpperCase())
          );
          if (match) {
            const coin = match.item;
            newsCoins.push({
              coin_id: coin.id,
              coin_symbol: coin.symbol,
              coin_name: coin.name,
              source: 'ai_news',
              trending_score: 85,
              description: `AI-identified opportunity`,
              metadata: {
                ai_analysis: line,
              },
            });
          }
        }
      }

      return newsCoins;
    } catch (error) {
      this.fastify.log.error('Error in AI news analysis:', error);
      return [];
    }
  }

  /**
   * Remove duplicates and calculate final trending scores
   */
  private deduplicateAndScore(coins: DiscoveredCoin[]): DiscoveredCoin[] {
    const coinMap = new Map<string, DiscoveredCoin>();

    for (const coin of coins) {
      const existing = coinMap.get(coin.coin_id);

      if (existing) {
        // Coin appears in multiple sources - boost score
        existing.trending_score = Math.min(
          100,
          Math.max(existing.trending_score, coin.trending_score) + 5
        );
        existing.source = `${existing.source},${coin.source}`;
        existing.metadata = {
          ...existing.metadata,
          ...coin.metadata,
          multi_source: true,
        };
      } else {
        coinMap.set(coin.coin_id, coin);
      }
    }

    return Array.from(coinMap.values())
      .sort((a, b) => b.trending_score - a.trending_score)
      .slice(0, 30); // Top 30 coins
  }

  /**
   * Get current spotlight coins for today
   */
  async getActiveSpotlightCoins() {
    const client = await this.fastify.pg.connect();

    try {
      const result = await client.query(
        `SELECT * FROM spotlight_coins
         WHERE discovery_date = CURRENT_DATE
         AND is_active = true
         ORDER BY trending_score DESC
         LIMIT 30`
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
}
