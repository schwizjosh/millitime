-- Add trading_settings table for per-user algo and WhatsApp notification preferences
CREATE TABLE IF NOT EXISTS trading_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  algo_enabled BOOLEAN DEFAULT true,
  run_in_background BOOLEAN DEFAULT true,
  whatsapp_number VARCHAR(32),
  whatsapp_api_key TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trading_settings_updated_at BEFORE UPDATE ON trading_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
