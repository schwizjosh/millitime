import axios from 'axios';

interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  published_at: string;
  domain: string;
  votes: {
    positive: number;
    negative: number;
    important: number;
  };
  kind: string; // 'news' or 'media'
  currencies: Array<{ code: string; title: string }>;
  source?: {
    title: string;
    region: string;
  };
}

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

export class CryptoPanicService {
  private baseUrl = 'https://cryptopanic.com/api/v1';
  private authToken: string | null = null;

  constructor() {
    // CryptoPanic is free without auth token, but you can add one for higher limits
    this.authToken = process.env.CRYPTOPANIC_API_KEY || null;
  }

  async fetchLatestNews(currencies?: string[], limit: number = 50): Promise<NewsArticle[]> {
    try {
      const params: any = {
        public: 'true',
        ...(this.authToken && { auth_token: this.authToken }),
        ...(currencies && currencies.length > 0 && { currencies: currencies.join(',') }),
      };

      const response = await axios.get(`${this.baseUrl}/posts/`, {
        params,
        timeout: 10000,
      });

      if (!response.data?.results) {
        console.warn('CryptoPanic returned no results');
        return [];
      }

      const articles: NewsArticle[] = response.data.results
        .slice(0, limit)
        .map((post: CryptoPanicPost) => ({
          source: 'cryptopanic',
          article_id: post.id.toString(),
          title: post.title,
          url: post.url,
          content: null, // CryptoPanic doesn't provide full content
          image_url: null,
          published_at: new Date(post.published_at),
          sentiment: this.calculateSentiment(post.votes),
          coins_mentioned: post.currencies?.map((c) => c.code.toUpperCase()) || [],
          categories: [post.kind],
          votes: post.votes.important,
          is_trending: post.votes.important > 10,
        }));

      console.log(`CryptoPanic: Fetched ${articles.length} articles`);
      return articles;
    } catch (error: any) {
      console.error('CryptoPanic fetch error:', error.message);
      return [];
    }
  }

  async fetchTrendingNews(limit: number = 20): Promise<NewsArticle[]> {
    try {
      const params: any = {
        public: 'true',
        filter: 'trending',
        ...(this.authToken && { auth_token: this.authToken }),
      };

      const response = await axios.get(`${this.baseUrl}/posts/`, {
        params,
        timeout: 10000,
      });

      if (!response.data?.results) {
        return [];
      }

      const articles: NewsArticle[] = response.data.results
        .slice(0, limit)
        .map((post: CryptoPanicPost) => ({
          source: 'cryptopanic',
          article_id: `trending-${post.id}`,
          title: post.title,
          url: post.url,
          content: null,
          image_url: null,
          published_at: new Date(post.published_at),
          sentiment: this.calculateSentiment(post.votes),
          coins_mentioned: post.currencies?.map((c) => c.code.toUpperCase()) || [],
          categories: ['trending', post.kind],
          votes: post.votes.important,
          is_trending: true,
        }));

      console.log(`CryptoPanic Trending: Fetched ${articles.length} articles`);
      return articles;
    } catch (error: any) {
      console.error('CryptoPanic trending fetch error:', error.message);
      return [];
    }
  }

  private calculateSentiment(votes: { positive: number; negative: number; important: number }): string | null {
    const total = votes.positive + votes.negative;
    if (total === 0) return null;

    const ratio = votes.positive / total;
    if (ratio > 0.6) return 'positive';
    if (ratio < 0.4) return 'negative';
    return 'neutral';
  }
}

export const cryptoPanicService = new CryptoPanicService();
