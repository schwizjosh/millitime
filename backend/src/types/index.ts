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

export interface Portfolio {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  quantity: number;
  average_buy_price: number;
  total_invested: number;
  created_at: Date;
  updated_at: Date;
}

export interface TradeHistory {
  id: number;
  user_id: number;
  trade_type: 'BUY' | 'SELL' | 'SWAP';
  from_coin_id?: string;
  from_coin_symbol?: string;
  from_quantity?: number;
  to_coin_id: string;
  to_coin_symbol: string;
  to_quantity: number;
  price: number;
  total_value: number;
  fee: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  notes?: string;
  created_at: Date;
}

export interface TokenUsage {
  id: number;
  user_id: number;
  provider: 'openai' | 'anthropic';
  model: string;
  operation: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  related_coin_id?: string;
  created_at: Date;
}

export interface AIActionStep {
  step: number;
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  completed?: boolean;
}

export interface AIActionSteps {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  signal_id?: number;
  action_plan: AIActionStep[];
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  confidence: number;
  reasoning: string;
  tokens_used: number;
  cost_usd: number;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface UserSettings {
  id: number;
  user_id: number;
  initial_balance: number;
  current_balance: number;
  preferred_ai_provider: 'auto' | 'openai' | 'anthropic';
  show_token_costs: boolean;
  auto_generate_actions: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TokenCostSummary {
  total_cost_usd: number;
  by_provider: {
    openai: number;
    anthropic: number;
  };
  by_operation: Record<string, number>;
  total_tokens: number;
  period_start: Date;
  period_end: Date;
}
