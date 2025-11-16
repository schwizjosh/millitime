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
}

export interface JWTPayload {
  id: number;
  email: string;
  username: string;
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
