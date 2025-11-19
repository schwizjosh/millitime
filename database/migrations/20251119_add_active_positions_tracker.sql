-- Add active positions tracking for 15-minute scalp trades
-- Migration: 20251119_add_active_positions_tracker
-- Description: Track open positions for real-time trade management and exit recommendations

CREATE TABLE IF NOT EXISTS active_positions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_id INT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,

  -- Position details
  coin_id VARCHAR(50) NOT NULL,
  coin_symbol VARCHAR(10) NOT NULL,
  position VARCHAR(10) NOT NULL, -- LONG/SHORT
  leverage INT DEFAULT 3,

  -- Price levels
  entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,

  -- Tracking
  entry_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_check TIMESTAMP,
  last_update_sent TIMESTAMP,
  check_in_15min_sent BOOLEAN DEFAULT FALSE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/CLOSED/EXPIRED
  exit_price DECIMAL(20, 8),
  exit_time TIMESTAMP,
  exit_reason VARCHAR(100), -- TP_HIT/SL_HIT/TIME_EXPIRED/REVERSAL/MANUAL

  -- Performance
  pnl_usd DECIMAL(20, 8),
  pnl_percent DECIMAL(10, 4),

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_active_positions_user_id ON active_positions(user_id);
CREATE INDEX idx_active_positions_status ON active_positions(status);
CREATE INDEX idx_active_positions_entry_time ON active_positions(entry_time);
CREATE INDEX idx_active_positions_user_status ON active_positions(user_id, status);

-- Comments
COMMENT ON TABLE active_positions IS 'Tracks active trading positions for 15-minute scalp trades with automated management';
COMMENT ON COLUMN active_positions.position IS 'LONG or SHORT based on futures position';
COMMENT ON COLUMN active_positions.check_in_15min_sent IS 'Whether 15-minute check-in alert was sent';
COMMENT ON COLUMN active_positions.exit_reason IS 'Reason for closing: TP_HIT, SL_HIT, TIME_EXPIRED, REVERSAL, MANUAL';
