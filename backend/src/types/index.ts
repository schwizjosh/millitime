// Type definitions for the application

export interface User {
  id: number;
  email: string;
  username: string;
  password_hash?: string;
  created_at: Date;
  updated_at: Date;
}

export interface WatchlistItem {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PriceHistory {
  id: number;
  coin_id: string;
  price: number;
  market_cap?: number;
  volume_24h?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  timestamp: Date;
}

export interface Signal {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  strength?: 'STRONG' | 'MODERATE' | 'WEAK';
  indicators?: Record<string, any>;
  message?: string;
  is_read: boolean;
  created_at: Date;
  // Futures trading parameters
  position?: 'LONG' | 'SHORT';
  leverage?: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  risk_reward_ratio?: number;
}

export interface JWTPayload {
  id: number;
  email: string;
  username: string;
}

export interface TradingSettings {
  user_id: number;
  algo_enabled: boolean;
  ai_enabled: boolean;
  run_in_background: boolean;
  whatsapp_number: string | null;
  whatsapp_api_key: string | null;
  preferred_exchange?: string;
  exchange_api_key?: string | null;
  exchange_api_secret?: string | null;
  updated_at: Date;
}

export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: any;
  last_updated: string;
}

export interface SpotlightCoin {
  id: number;
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  discovery_date: Date;
  source: string;
  market_cap?: number;
  volume_24h?: number;
  price_change_24h?: number;
  trending_score?: number;
  description?: string;
  metadata?: Record<string, any>;
  is_active: boolean;
  created_at: Date;
}

export interface ExchangeCoin {
  id: number;
  exchange_name: string;
  coin_id: string;
  coin_symbol: string;
  trading_pair?: string;
  is_futures_available: boolean;
  last_updated: Date;
}

export interface Backtest {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  start_date: Date;
  end_date: Date;
  initial_balance: number;
  final_balance: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_profit_loss: number;
  profit_loss_percentage: number;
  max_drawdown: number;
  sharpe_ratio: number;
  strategy_params?: Record<string, any>;
  trade_history?: Record<string, any>;
  created_at: Date;
}

export interface FuturesPosition {
  position: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: number;
}
