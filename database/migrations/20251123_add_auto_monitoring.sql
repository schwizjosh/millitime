-- Auto-Monitoring System Migration
-- This migration adds support for automatically monitoring trending coins

-- Table to track auto-monitored coins with their reasons
CREATE TABLE IF NOT EXISTS auto_monitored_coins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_id VARCHAR(255) NOT NULL,
    coin_symbol VARCHAR(50) NOT NULL,
    monitoring_reason VARCHAR(50) NOT NULL, -- 'top_gainer', 'top_loser', 'news_spike', 'nascent_trend'
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Metrics at time of addition
    price_change_24h DECIMAL,
    volume_24h DECIMAL,
    news_count INTEGER DEFAULT 0,
    social_volume INTEGER DEFAULT 0,
    trend_score DECIMAL,

    -- Current status
    is_active BOOLEAN DEFAULT true,
    removed_at TIMESTAMP,
    removal_reason TEXT,

    -- Ensure each user can only auto-monitor a coin once per reason
    UNIQUE(user_id, coin_id, monitoring_reason)
);

-- Table to store auto-monitoring criteria/thresholds
CREATE TABLE IF NOT EXISTS auto_monitoring_config (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- Top Gainers/Losers config
    enable_top_gainers BOOLEAN DEFAULT true,
    enable_top_losers BOOLEAN DEFAULT true,
    gainer_threshold_percent DECIMAL DEFAULT 15.0, -- Min 24h gain %
    loser_threshold_percent DECIMAL DEFAULT -15.0, -- Max 24h loss %
    min_volume_usd DECIMAL DEFAULT 1000000, -- Min $1M volume
    top_n_count INTEGER DEFAULT 10, -- Monitor top N coins

    -- News-based monitoring config
    enable_news_monitoring BOOLEAN DEFAULT true,
    news_spike_threshold INTEGER DEFAULT 5, -- Min articles in 24h
    news_sentiment_filter VARCHAR(20) DEFAULT 'all', -- 'positive', 'negative', 'all'

    -- Nascent trend config
    enable_nascent_trends BOOLEAN DEFAULT true,
    nascent_volume_increase_percent DECIMAL DEFAULT 50.0, -- 50% volume increase
    nascent_price_change_min DECIMAL DEFAULT 5.0, -- Min 5% price change
    nascent_uniqueness_score DECIMAL DEFAULT 70.0, -- Uniqueness threshold

    -- Auto-removal config
    hours_before_recheck INTEGER DEFAULT 6, -- Check if still meets criteria every N hours
    max_monitoring_days INTEGER DEFAULT 7, -- Auto-remove after N days

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to log auto-monitoring actions
CREATE TABLE IF NOT EXISTS auto_monitoring_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_id VARCHAR(255) NOT NULL,
    coin_symbol VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'added', 'removed', 'revalidated'
    reason TEXT,
    metadata JSONB, -- Store additional context
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_auto_monitored_coins_user ON auto_monitored_coins(user_id);
CREATE INDEX idx_auto_monitored_coins_active ON auto_monitored_coins(is_active) WHERE is_active = true;
CREATE INDEX idx_auto_monitored_coins_reason ON auto_monitored_coins(monitoring_reason);
CREATE INDEX idx_auto_monitored_coins_last_checked ON auto_monitored_coins(last_checked_at) WHERE is_active = true;
CREATE INDEX idx_auto_monitoring_log_user ON auto_monitoring_log(user_id);
CREATE INDEX idx_auto_monitoring_log_created ON auto_monitoring_log(created_at);

-- Insert default config for existing users
INSERT INTO auto_monitoring_config (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
