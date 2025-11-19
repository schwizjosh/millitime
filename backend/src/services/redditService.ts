import axios from 'axios';

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

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    score: number;
    num_comments: number;
    created_utc: number;
    link_flair_text?: string;
    thumbnail?: string;
    preview?: any;
  };
}

export class RedditService {
  private subreddits = [
    'CryptoCurrency',
    'Bitcoin',
    'ethereum',
    'CryptoMarkets',
    'altcoin',
  ];

  private coinKeywords: Record<string, string[]> = {
    BTC: ['bitcoin', 'btc'],
    ETH: ['ethereum', 'eth', 'ether'],
    SOL: ['solana', 'sol'],
    BNB: ['binance', 'bnb'],
    XRP: ['ripple', 'xrp'],
    ADA: ['cardano', 'ada'],
    DOGE: ['dogecoin', 'doge'],
    MATIC: ['polygon', 'matic'],
    DOT: ['polkadot', 'dot'],
    AVAX: ['avalanche', 'avax'],
  };

  async fetchHotPosts(limit: number = 25): Promise<NewsArticle[]> {
    // Parallelize subreddit fetches for better performance
    const promises = this.subreddits.map(async (subreddit) => {
      try {
        return await this.fetchSubreddit(subreddit, 'hot', limit);
      } catch (error: any) {
        console.error(`Reddit ${subreddit} error:`, error.message);
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    const allArticles = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => (result as PromiseFulfilledResult<NewsArticle[]>).value);

    console.log(`Reddit: Fetched ${allArticles.length} hot posts (parallel)`);
    return allArticles;
  }

  async fetchTopPosts(timeframe: 'hour' | 'day' | 'week' = 'day', limit: number = 25): Promise<NewsArticle[]> {
    // Parallelize subreddit fetches for better performance
    const promises = this.subreddits.map(async (subreddit) => {
      try {
        return await this.fetchSubreddit(subreddit, 'top', limit, timeframe);
      } catch (error: any) {
        console.error(`Reddit ${subreddit} error:`, error.message);
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    const allArticles = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => (result as PromiseFulfilledResult<NewsArticle[]>).value);

    console.log(`Reddit Top: Fetched ${allArticles.length} posts (parallel)`);
    return allArticles;
  }

  async getSocialMetrics(coinSymbol: string): Promise<{
    posts: number;
    comments: number;
    score: number;
  }> {
    try {
      const searchQuery = coinSymbol.toLowerCase();
      const response = await axios.get(
        `https://www.reddit.com/r/CryptoCurrency/search.json`,
        {
          params: {
            q: searchQuery,
            restrict_sr: true,
            t: 'day',
            limit: 100,
          },
          headers: {
            'User-Agent': 'Millitime/1.0',
          },
          timeout: 10000,
        }
      );

      const posts = response.data?.data?.children || [];
      const metrics = {
        posts: posts.length,
        comments: posts.reduce((sum: number, p: RedditPost) => sum + (p.data.num_comments || 0), 0),
        score: posts.reduce((sum: number, p: RedditPost) => sum + (p.data.score || 0), 0),
      };

      return metrics;
    } catch (error: any) {
      console.error(`Reddit metrics for ${coinSymbol} error:`, error.message);
      return { posts: 0, comments: 0, score: 0 };
    }
  }

  private async fetchSubreddit(
    subreddit: string,
    sort: 'hot' | 'top' | 'new',
    limit: number,
    timeframe?: 'hour' | 'day' | 'week'
  ): Promise<NewsArticle[]> {
    try {
      const params: any = { limit };
      if (timeframe) params.t = timeframe;

      const response = await axios.get(
        `https://www.reddit.com/r/${subreddit}/${sort}.json`,
        {
          params,
          headers: {
            'User-Agent': 'Millitime/1.0',
          },
          timeout: 10000,
        }
      );

      if (!response.data?.data?.children) {
        return [];
      }

      const posts: RedditPost[] = response.data.data.children;
      const articles: NewsArticle[] = [];

      for (const post of posts) {
        const p = post.data;

        // Skip if post is too old (more than 24 hours)
        const ageHours = (Date.now() / 1000 - p.created_utc) / 3600;
        if (ageHours > 24) continue;

        // Skip low-quality posts
        if (p.score < 10) continue;

        const text = `${p.title} ${p.selftext}`.toLowerCase();
        const coinsDetected = this.detectCoins(text);

        // Skip if no crypto coins detected
        if (coinsDetected.length === 0) continue;

        articles.push({
          source: 'reddit',
          article_id: p.id,
          title: p.title,
          url: `https://reddit.com${p.permalink}`,
          content: p.selftext ? p.selftext.substring(0, 500) : null,
          image_url: this.extractImageUrl(p),
          published_at: new Date(p.created_utc * 1000),
          sentiment: this.guessSentiment(p.title, p.selftext),
          coins_mentioned: coinsDetected,
          categories: ['reddit', subreddit.toLowerCase()],
          votes: p.score,
          is_trending: p.score > 1000,
        });
      }

      return articles;
    } catch (error: any) {
      console.error(`Reddit r/${subreddit} fetch error:`, error.message);
      return [];
    }
  }

  private detectCoins(text: string): string[] {
    const detected = new Set<string>();

    for (const [symbol, keywords] of Object.entries(this.coinKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          detected.add(symbol);
          break;
        }
      }
    }

    return Array.from(detected);
  }

  private guessSentiment(title: string, content: string): string | null {
    const text = `${title} ${content}`.toLowerCase();

    const positiveWords = ['bullish', 'moon', 'pump', 'buy', 'growth', 'surge', 'rally', 'breakthrough'];
    const negativeWords = ['bearish', 'dump', 'crash', 'sell', 'drop', 'fall', 'scam', 'warning'];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach((word) => {
      if (text.includes(word)) positiveCount++;
    });

    negativeWords.forEach((word) => {
      if (text.includes(word)) negativeCount++;
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private extractImageUrl(post: any): string | null {
    if (post.thumbnail && post.thumbnail.startsWith('http')) {
      return post.thumbnail;
    }

    if (post.preview?.images?.[0]?.source?.url) {
      return post.preview.images[0].source.url.replace(/&amp;/g, '&');
    }

    return null;
  }
}

export const redditService = new RedditService();
