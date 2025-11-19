import axios from 'axios';

interface SocialMetrics {
  coin_id: string;
  coin_symbol: string;
  social_volume: number;
  social_sentiment: number;
  social_contributors: number;
  social_dominance: number;
  galaxy_score: number;
  alt_rank: number;
}

interface LunarCrushAsset {
  s: string; // symbol
  n: string; // name
  id: number;
  gs: number; // galaxy score
  ar: number; // alt rank
  sv: number; // social volume
  ss: number; // social score (sentiment)
  sc: number; // social contributors
  sd: number; // social dominance
  mc: number; // market cap
  pch: number; // price change
}

export class LunarCrushService {
  private apiKey: string | null = null;
  private baseUrl = 'https://lunarcrush.com/api4/public';
  private freeBaseUrl = 'https://lunarcrush.com/api3/coins';

  constructor() {
    // LunarCrush has a free tier (100 req/day) and paid tiers
    this.apiKey = process.env.LUNARCRUSH_API_KEY || null;
  }

  async getSocialMetrics(coinSymbol: string): Promise<SocialMetrics | null> {
    try {
      // Use free API first
      const response = await axios.get(`${this.freeBaseUrl}/${coinSymbol}/v1`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Millitime/1.0',
        },
      });

      if (!response.data?.data) {
        console.warn(`LunarCrush: No data for ${coinSymbol}`);
        return null;
      }

      const data = response.data.data;

      return {
        coin_id: coinSymbol.toLowerCase(),
        coin_symbol: coinSymbol,
        social_volume: data.social_volume || data.sv || 0,
        social_sentiment: this.normalizeSentiment(data.social_score || data.ss || 50),
        social_contributors: data.social_contributors || data.sc || 0,
        social_dominance: data.social_dominance || data.sd || 0,
        galaxy_score: data.galaxy_score || data.gs || 0,
        alt_rank: data.alt_rank || data.ar || 999,
      };
    } catch (error: any) {
      console.error(`LunarCrush ${coinSymbol} error:`, error.message);
      return null;
    }
  }

  async getTrendingCoins(limit: number = 20): Promise<SocialMetrics[]> {
    try {
      // Free endpoint for trending coins
      const response = await axios.get(`${this.freeBaseUrl}`, {
        params: {
          sort: 'galaxy_score',
          limit,
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'Millitime/1.0',
        },
      });

      if (!response.data?.data) {
        return [];
      }

      const metrics: SocialMetrics[] = response.data.data.map((asset: any) => ({
        coin_id: asset.symbol?.toLowerCase() || asset.s?.toLowerCase(),
        coin_symbol: asset.symbol || asset.s,
        social_volume: asset.social_volume || asset.sv || 0,
        social_sentiment: this.normalizeSentiment(asset.social_score || asset.ss || 50),
        social_contributors: asset.social_contributors || asset.sc || 0,
        social_dominance: asset.social_dominance || asset.sd || 0,
        galaxy_score: asset.galaxy_score || asset.gs || 0,
        alt_rank: asset.alt_rank || asset.ar || 999,
      }));

      console.log(`LunarCrush: Fetched ${metrics.length} trending coins`);
      return metrics;
    } catch (error: any) {
      console.error('LunarCrush trending error:', error.message);
      return [];
    }
  }

  async getBulkSocialMetrics(coinSymbols: string[]): Promise<SocialMetrics[]> {
    const metrics: SocialMetrics[] = [];

    // Fetch in batches to avoid rate limiting (5 at a time, 2 second delay between batches)
    for (let i = 0; i < coinSymbols.length; i += 5) {
      const batch = coinSymbols.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map((symbol) => this.getSocialMetrics(symbol))
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          metrics.push(result.value);
        }
      });

      // Wait 2 seconds between batches to respect rate limits (100 req/day = ~1 req per 15 min)
      if (i + 5 < coinSymbols.length) {
        await this.sleep(2000);
      }
    }

    console.log(`LunarCrush: Fetched metrics for ${metrics.length}/${coinSymbols.length} coins`);
    return metrics;
  }

  private normalizeSentiment(score: number): number {
    // LunarCrush scores are typically 0-100, normalize to -1 to 1
    return ((score - 50) / 50);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const lunarCrushService = new LunarCrushService();
