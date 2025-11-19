-- News Articles Table
CREATE TABLE IF NOT EXISTS news_articles (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL, -- 'cryptopanic', 'coindesk', 'cointelegraph', 'reddit', etc.
  article_id VARCHAR(255), -- External ID from source (for deduplication)
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  published_at TIMESTAMP NOT NULL,
  sentiment VARCHAR(20), -- 'positive', 'negative', 'neutral'
  coins_mentioned TEXT[], -- Array of coin symbols mentioned
  categories TEXT[], -- 'news', 'media', 'rising', etc.
  votes INTEGER DEFAULT 0, -- From CryptoPanic
  is_trending BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, article_id)
);

CREATE INDEX idx_news_published_at ON news_articles(published_at DESC);
CREATE INDEX idx_news_source ON news_articles(source);
CREATE INDEX idx_news_coins ON news_articles USING GIN(coins_mentioned);
CREATE INDEX idx_news_trending ON news_articles(is_trending, published_at DESC);

-- Social Metrics Table (daily aggregated metrics per coin)
CREATE TABLE IF NOT EXISTS social_metrics (
  id SERIAL PRIMARY KEY,
  coin_id VARCHAR(100) NOT NULL,
  coin_symbol VARCHAR(20) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Twitter/Social (from LunarCrush)
  social_volume INTEGER DEFAULT 0, -- Total mentions
  social_sentiment NUMERIC(3,2), -- -1 to 1 scale
  social_contributors INTEGER DEFAULT 0, -- Unique posters
  social_dominance NUMERIC(5,2), -- % of total crypto mentions

  -- Reddit
  reddit_posts INTEGER DEFAULT 0,
  reddit_comments INTEGER DEFAULT 0,
  reddit_score INTEGER DEFAULT 0, -- Upvotes

  -- Engagement scores
  galaxy_score INTEGER, -- LunarCrush 0-100
  alt_rank INTEGER, -- LunarCrush ranking

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(coin_id, date)
);

CREATE INDEX idx_social_coin_date ON social_metrics(coin_id, date DESC);
CREATE INDEX idx_social_date ON social_metrics(date DESC);

-- Whale Alerts Table
CREATE TABLE IF NOT EXISTS whale_alerts (
  id SERIAL PRIMARY KEY,
  coin_symbol VARCHAR(20) NOT NULL,
  blockchain VARCHAR(50) NOT NULL, -- 'bitcoin', 'ethereum', etc.
  transaction_hash TEXT,
  amount NUMERIC(30, 8) NOT NULL,
  amount_usd NUMERIC(15, 2),
  from_address TEXT,
  to_address TEXT,
  from_owner VARCHAR(100), -- Exchange name if known
  to_owner VARCHAR(100),
  transaction_type VARCHAR(50), -- 'transfer', 'mint', 'burn'
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(transaction_hash)
);

CREATE INDEX idx_whale_coin ON whale_alerts(coin_symbol, timestamp DESC);
CREATE INDEX idx_whale_timestamp ON whale_alerts(timestamp DESC);
CREATE INDEX idx_whale_amount_usd ON whale_alerts(amount_usd DESC);

-- User News Preferences (which sources/coins they want to see)
CREATE TABLE IF NOT EXISTS user_news_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  enabled_sources TEXT[] DEFAULT ARRAY['cryptopanic', 'coindesk', 'cointelegraph', 'reddit'],
  show_whale_alerts BOOLEAN DEFAULT true,
  min_whale_amount_usd NUMERIC(15, 2) DEFAULT 1000000, -- $1M minimum
  sentiment_filter VARCHAR(20), -- null = all, or 'positive', 'negative'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- News Fetch Log (track when we last fetched from each source)
CREATE TABLE IF NOT EXISTS news_fetch_log (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  last_fetch_at TIMESTAMP NOT NULL,
  articles_fetched INTEGER DEFAULT 0,
  fetch_status VARCHAR(20) DEFAULT 'success', -- 'success', 'error', 'rate_limited'
  error_message TEXT,
  UNIQUE(source)
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_social_metrics_updated_at
  BEFORE UPDATE ON social_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_news_preferences_updated_at
  BEFORE UPDATE ON user_news_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE news_articles IS 'Aggregated crypto news from multiple sources';
COMMENT ON TABLE social_metrics IS 'Daily social media metrics per coin';
COMMENT ON TABLE whale_alerts IS 'Large cryptocurrency transactions';
COMMENT ON TABLE user_news_preferences IS 'User preferences for news filtering';
