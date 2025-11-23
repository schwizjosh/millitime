-- Migration to add max_total_auto_monitored_coins column
-- This limits the total number of coins a user can have auto-monitored
-- to prevent signal overload and manage system resources

ALTER TABLE auto_monitoring_config
ADD COLUMN IF NOT EXISTS max_total_auto_monitored_coins INTEGER DEFAULT 25;

-- Add comment explaining the column
COMMENT ON COLUMN auto_monitoring_config.max_total_auto_monitored_coins IS
  'Maximum number of coins that can be auto-monitored per user (default 25)';
