-- Add user feedback for ML training loop
-- Migration: 20251120_add_user_feedback_and_positions
-- Description: Create trading_positions table for historical trades and add user feedback columns

-- 1. Create trading_positions table for historical closed positions
-- This is separate from active_positions to maintain historical data for ML training
CREATE TABLE IF NOT EXISTS trading_positions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_id INT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,

  -- Position details
  coin_id VARCHAR(50) NOT NULL,
  coin_symbol VARCHAR(10) NOT NULL,
  position_type VARCHAR(10) NOT NULL, -- LONG/SHORT
  leverage INT DEFAULT 3,

  -- Price levels
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,

  -- Timing
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/CLOSED/EXPIRED
  exit_reason VARCHAR(100), -- TP_HIT/SL_HIT/TIME_EXPIRED/REVERSAL/MANUAL

  -- Performance
  pnl_usd DECIMAL(20, 8),
  pnl_percent DECIMAL(10, 4),

  -- User feedback for ML training
  user_feedback VARCHAR(20), -- GOOD/BAD/NEUTRAL
  user_rating INT CHECK (user_rating >= 1 AND user_rating <= 5), -- 1-5 stars
  user_notes TEXT, -- Optional notes from user
  feedback_timestamp TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add user feedback columns to active_positions table
ALTER TABLE active_positions
ADD COLUMN IF NOT EXISTS user_feedback VARCHAR(20),
ADD COLUMN IF NOT EXISTS user_rating INT CHECK (user_rating >= 1 AND user_rating <= 5),
ADD COLUMN IF NOT EXISTS user_notes TEXT,
ADD COLUMN IF NOT EXISTS feedback_timestamp TIMESTAMP;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trading_positions_user_id ON trading_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_positions_signal_id ON trading_positions(signal_id);
CREATE INDEX IF NOT EXISTS idx_trading_positions_status ON trading_positions(status);
CREATE INDEX IF NOT EXISTS idx_trading_positions_coin_id ON trading_positions(coin_id);
CREATE INDEX IF NOT EXISTS idx_trading_positions_opened_at ON trading_positions(opened_at);
CREATE INDEX IF NOT EXISTS idx_trading_positions_user_status ON trading_positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trading_positions_feedback ON trading_positions(user_feedback);

-- 4. Add trigger for updated_at
CREATE TRIGGER update_trading_positions_updated_at BEFORE UPDATE ON trading_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Comments
COMMENT ON TABLE trading_positions IS 'Historical trading positions for backtesting and ML training';
COMMENT ON COLUMN trading_positions.position_type IS 'LONG or SHORT based on futures position';
COMMENT ON COLUMN trading_positions.user_feedback IS 'User feedback: GOOD, BAD, or NEUTRAL';
COMMENT ON COLUMN trading_positions.user_rating IS 'User rating from 1-5 stars';
COMMENT ON COLUMN trading_positions.user_notes IS 'Optional notes from user about the trade';
COMMENT ON COLUMN trading_positions.exit_reason IS 'Reason for closing: TP_HIT, SL_HIT, TIME_EXPIRED, REVERSAL, MANUAL';
