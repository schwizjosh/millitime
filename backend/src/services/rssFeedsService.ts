import Parser from 'rss-parser';

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

interface RSSFeed {
  name: string;
  url: string;
  category: string;
}

export class RSSFeedsService {
  private parser: Parser;
  private feeds: RSSFeed[] = [
    { name: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'news' },
    { name: 'cointelegraph', url: 'https://cointelegraph.com/rss', category: 'news' },
    { name: 'bitcoinmagazine', url: 'https://bitcoinmagazine.com/.rss/full/', category: 'news' },
    { name: 'cryptoslate', url: 'https://cryptoslate.com/feed/', category: 'news' },
    { name: 'decrypt', url: 'https://decrypt.co/feed', category: 'news' },
    { name: 'theblock', url: 'https://www.theblock.co/rss.xml', category: 'news' },
    { name: 'beincrypto', url: 'https://beincrypto.com/feed/', category: 'news' },
    { name: 'bitcoinnews', url: 'https://news.bitcoin.com/feed/', category: 'news' },
  ];

  // Coin keywords to detect in article titles/content
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
    SHIB: ['shiba', 'shib'],
    LINK: ['chainlink', 'link'],
    UNI: ['uniswap', 'uni'],
    ATOM: ['cosmos', 'atom'],
    LTC: ['litecoin', 'ltc'],
    BCH: ['bitcoin cash', 'bch'],
    NEAR: ['near protocol', 'near'],
    APT: ['aptos', 'apt'],
    ARB: ['arbitrum', 'arb'],
    OP: ['optimism', 'op'],
  };

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Millitime/1.0',
      },
    });
  }

  async fetchAllFeeds(): Promise<NewsArticle[]> {
    const allArticles: NewsArticle[] = [];

    // Fetch from all feeds in parallel
    const results = await Promise.allSettled(
      this.feeds.map((feed) => this.fetchFeed(feed))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allArticles.push(...result.value);
      } else {
        console.error(`Failed to fetch ${this.feeds[index].name}:`, result.reason?.message);
      }
    });

    console.log(`RSS Feeds: Fetched ${allArticles.length} total articles`);
    return allArticles;
  }

  private async fetchFeed(feed: RSSFeed): Promise<NewsArticle[]> {
    try {
      const parsedFeed = await this.parser.parseURL(feed.url);
      const articles: NewsArticle[] = [];

      for (const item of parsedFeed.items.slice(0, 20)) {
        // Only take recent 20 from each feed
        if (!item.link || !item.title) continue;

        const publishedDate = item.pubDate ? new Date(item.pubDate) : new Date();

        // Skip articles older than 48 hours
        const hoursOld = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60);
        if (hoursOld > 48) continue;

        const content = item.contentSnippet || item.content || null;
        const coinsDetected = this.detectCoins(item.title, content);

        articles.push({
          source: feed.name,
          article_id: this.generateArticleId(item.link),
          title: item.title,
          url: item.link,
          content: content ? content.substring(0, 500) : null, // Limit content length
          image_url: this.extractImageUrl(item),
          published_at: publishedDate,
          sentiment: null, // RSS feeds don't provide sentiment
          coins_mentioned: coinsDetected,
          categories: [feed.category],
          votes: 0,
          is_trending: false,
        });
      }

      console.log(`RSS ${feed.name}: Fetched ${articles.length} articles`);
      return articles;
    } catch (error: any) {
      console.error(`RSS ${feed.name} error:`, error.message);
      return [];
    }
  }

  private detectCoins(title: string, content: string | null): string[] {
    const text = `${title} ${content || ''}`.toLowerCase();
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

  private extractImageUrl(item: any): string | null {
    // Try various common image fields in RSS
    if (item.enclosure?.url) return item.enclosure.url;
    if (item['media:thumbnail']?.$?.url) return item['media:thumbnail'].$.url;
    if (item['media:content']?.$?.url) return item['media:content'].$.url;

    // Try to extract from content
    if (item.content) {
      const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
      if (imgMatch) return imgMatch[1];
    }

    return null;
  }

  private generateArticleId(url: string): string {
    // Create a simple hash from URL for deduplication
    return Buffer.from(url).toString('base64').substring(0, 50);
  }
}

export const rssFeedsService = new RSSFeedsService();
