-- Add per-user AI enhancement toggle
-- Migration: 20250119_add_per_user_ai_toggle
-- Description: Add ai_enabled column to allow users to toggle AI-enhanced signals individually

-- Add ai_enabled column (defaults to false for security/cost control)
ALTER TABLE trading_settings
ADD COLUMN IF NOT EXISTS ai_enabled boolean DEFAULT false;

-- Enable AI for specific whitelisted users (schwizjosh@gmail.com, joshuanbk@gmail.com)
UPDATE trading_settings
SET ai_enabled = true
WHERE user_id IN (
  SELECT id FROM users WHERE email IN ('schwizjosh@gmail.com', 'joshuanbk@gmail.com')
);

-- Add comment
COMMENT ON COLUMN trading_settings.ai_enabled IS 'Enable AI-enhanced signal analysis (requires OpenAI/Claude API access)';
