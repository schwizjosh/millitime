-- Migration 002: Swap/Trading and Bag System
-- Adds portfolio holdings, trade history, token usage tracking, and AI action steps

-- Create portfolio (bag) table to track user holdings
CREATE TABLE IF NOT EXISTS portfolio (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  coin_id VARCHAR(100) NOT NULL, -- CoinGecko coin ID
  coin_symbol VARCHAR(20) NOT NULL,
  coin_name VARCHAR(100) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
  average_buy_price DECIMAL(20, 8) NOT NULL DEFAULT 0,
  total_invested DECIMAL(20, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, coin_id)
);

-- Create trade_history table to track all swaps/trades
CREATE TABLE IF NOT EXISTS trade_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  trade_type VARCHAR(20) NOT NULL, -- 'BUY', 'SELL', 'SWAP'
  from_coin_id VARCHAR(100), -- For swaps
  from_coin_symbol VARCHAR(20),
  from_quantity DECIMAL(20, 8),
  to_coin_id VARCHAR(100) NOT NULL,
  to_coin_symbol VARCHAR(20) NOT NULL,
  to_quantity DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8) NOT NULL, -- Price at execution
  total_value DECIMAL(20, 2) NOT NULL, -- Total value in USD
  fee DECIMAL(20, 8) DEFAULT 0, -- Trading fee
  status VARCHAR(20) DEFAULT 'COMPLETED', -- 'PENDING', 'COMPLETED', 'FAILED'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create token_usage table to track AI token consumption and costs
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic'
  model VARCHAR(100) NOT NULL, -- 'gpt-4o-mini', 'claude-3.5-haiku', etc.
  operation VARCHAR(100) NOT NULL, -- 'fundamental_analysis', 'ai_decision', 'action_steps', etc.
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0, -- Cost in USD
  related_coin_id VARCHAR(100), -- Optional: which coin this was for
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create ai_action_steps table to store AI-generated trading action plans
CREATE TABLE IF NOT EXISTS ai_action_steps (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  coin_id VARCHAR(100) NOT NULL,
  coin_symbol VARCHAR(20) NOT NULL,
  signal_id INTEGER REFERENCES signals(id) ON DELETE SET NULL,
  action_plan JSONB NOT NULL, -- Array of action steps with priorities
  status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMPLETED', 'CANCELLED'
  confidence DECIMAL(5, 2), -- 0-100 confidence score
  reasoning TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Create user_settings table for preferences
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  initial_balance DECIMAL(20, 2) DEFAULT 10000.00, -- Starting virtual balance
  current_balance DECIMAL(20, 2) DEFAULT 10000.00, -- Current available balance
  preferred_ai_provider VARCHAR(50) DEFAULT 'auto', -- 'auto', 'openai', 'anthropic'
  show_token_costs BOOLEAN DEFAULT true,
  auto_generate_actions BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_coin_id ON portfolio(coin_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_user_id ON trade_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_created_at ON trade_history(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_ai_action_steps_user_id ON ai_action_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_steps_status ON ai_action_steps(status);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_portfolio_updated_at BEFORE UPDATE ON portfolio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_action_steps_updated_at BEFORE UPDATE ON ai_action_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE portfolio IS 'User cryptocurrency holdings (the bag)';
COMMENT ON TABLE trade_history IS 'Complete history of all trades and swaps';
COMMENT ON TABLE token_usage IS 'AI token consumption tracking for cost accountability';
COMMENT ON TABLE ai_action_steps IS 'AI-generated action plans for trading';
COMMENT ON TABLE user_settings IS 'User preferences and virtual balance';
COMMENT ON COLUMN token_usage.cost_usd IS 'Actual cost in USD based on provider pricing';
COMMENT ON COLUMN user_settings.current_balance IS 'Virtual USD balance for simulated trading';
