-- Futures Trading Enhancements Migration
-- Adds support for futures trading signals, spotlight coins, exchange filtering, and backtesting

-- 1. Add futures trading parameters to signals table
ALTER TABLE signals
ADD COLUMN IF NOT EXISTS position VARCHAR(10), -- 'LONG' or 'SHORT'
ADD COLUMN IF NOT EXISTS leverage DECIMAL(5, 2), -- e.g., 5.00 for 5x leverage
ADD COLUMN IF NOT EXISTS entry_price DECIMAL(20, 8), -- Recommended entry price
ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20, 8), -- Stop loss price
ADD COLUMN IF NOT EXISTS take_profit DECIMAL(20, 8), -- Take profit price
ADD COLUMN IF NOT EXISTS risk_reward_ratio DECIMAL(5, 2); -- e.g., 3.00 for 1:3 risk/reward

-- 2. Add exchange preferences to trading_settings
ALTER TABLE trading_settings
ADD COLUMN IF NOT EXISTS preferred_exchange VARCHAR(50) DEFAULT 'binance', -- 'binance', 'kraken', 'coinbase', etc.
ADD COLUMN IF NOT EXISTS exchange_api_key TEXT,
ADD COLUMN IF NOT EXISTS exchange_api_secret TEXT;

-- 3. Create spotlight_coins table for daily discovered trending coins
CREATE TABLE IF NOT EXISTS spotlight_coins (
  id SERIAL PRIMARY KEY,
  coin_id VARCHAR(100) NOT NULL,
  coin_symbol VARCHAR(20) NOT NULL,
  coin_name VARCHAR(100) NOT NULL,
  discovery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(50), -- 'trending', 'news', 'social', 'ai_discovery'
  market_cap DECIMAL(20, 2),
  volume_24h DECIMAL(20, 2),
  price_change_24h DECIMAL(10, 4),
  trending_score INTEGER, -- 1-100 score
  description TEXT,
  metadata JSONB, -- Store additional discovery metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(coin_id, discovery_date)
);

CREATE INDEX IF NOT EXISTS idx_spotlight_coins_discovery_date ON spotlight_coins(discovery_date);
CREATE INDEX IF NOT EXISTS idx_spotlight_coins_trending_score ON spotlight_coins(trending_score);
CREATE INDEX IF NOT EXISTS idx_spotlight_coins_is_active ON spotlight_coins(is_active);

-- 4. Create user_spotlight_monitoring table for users tracking specific spotlight coins
CREATE TABLE IF NOT EXISTS user_spotlight_monitoring (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  spotlight_coin_id INTEGER REFERENCES spotlight_coins(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, spotlight_coin_id)
);

CREATE INDEX IF NOT EXISTS idx_user_spotlight_monitoring_user_id ON user_spotlight_monitoring(user_id);
CREATE INDEX IF NOT EXISTS idx_user_spotlight_monitoring_spotlight_coin_id ON user_spotlight_monitoring(spotlight_coin_id);

-- 5. Create exchange_coins table for tracking which coins are available on which exchanges
CREATE TABLE IF NOT EXISTS exchange_coins (
  id SERIAL PRIMARY KEY,
  exchange_name VARCHAR(50) NOT NULL, -- 'binance', 'kraken', 'coinbase', etc.
  coin_id VARCHAR(100) NOT NULL,
  coin_symbol VARCHAR(20) NOT NULL,
  trading_pair VARCHAR(20), -- e.g., 'BTCUSDT', 'ETHUSDT'
  is_futures_available BOOLEAN DEFAULT false,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exchange_name, coin_id)
);

CREATE INDEX IF NOT EXISTS idx_exchange_coins_exchange_name ON exchange_coins(exchange_name);
CREATE INDEX IF NOT EXISTS idx_exchange_coins_coin_id ON exchange_coins(coin_id);
CREATE INDEX IF NOT EXISTS idx_exchange_coins_is_futures_available ON exchange_coins(is_futures_available);

-- 6. Create backtests table for storing algorithm backtest results
CREATE TABLE IF NOT EXISTS backtests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  coin_id VARCHAR(100) NOT NULL,
  coin_symbol VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_balance DECIMAL(20, 2) NOT NULL,
  final_balance DECIMAL(20, 2) NOT NULL,
  total_trades INTEGER NOT NULL,
  winning_trades INTEGER NOT NULL,
  losing_trades INTEGER NOT NULL,
  win_rate DECIMAL(5, 2), -- Percentage
  total_profit_loss DECIMAL(20, 2),
  profit_loss_percentage DECIMAL(10, 4),
  max_drawdown DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),
  strategy_params JSONB, -- Store strategy parameters used
  trade_history JSONB, -- Store detailed trade history
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backtests_user_id ON backtests(user_id);
CREATE INDEX IF NOT EXISTS idx_backtests_coin_id ON backtests(coin_id);
CREATE INDEX IF NOT EXISTS idx_backtests_created_at ON backtests(created_at);

-- 7. Create fa_discovery_log table to track fundamental analysis searches
CREATE TABLE IF NOT EXISTS fa_discovery_log (
  id SERIAL PRIMARY KEY,
  search_date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_keywords TEXT[],
  coins_discovered INTEGER,
  sources_checked TEXT[], -- ['coingecko_trending', 'news_api', 'social_sentiment']
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fa_discovery_log_search_date ON fa_discovery_log(search_date);

-- 8. Add trigger for exchange_coins updated_at
CREATE TRIGGER update_exchange_coins_updated_at BEFORE UPDATE ON exchange_coins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
