import axios from 'axios';

// Use environment variable or relative URL for production
// In production (m.raysourcelabs.com), nginx proxies /api to backend
// In development, use localhost:3000
const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  email: string;
  username: string;
  created_at: string;
}

export interface WatchlistItem {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  indicators: any;
  message: string;
  is_read: boolean;
  created_at: string;
  // Futures parameters
  position?: 'LONG' | 'SHORT';
  leverage?: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  risk_reward_ratio?: number;
}

export interface TradingSettings {
  algo_enabled: boolean;
  ai_enabled: boolean;
  run_in_background: boolean;
  whatsapp_number: string | null;
  whatsapp_api_key: string | null;
  preferred_exchange?: string;
  exchange_api_key?: string | null;
  exchange_api_secret?: string | null;
  updated_at: string;
}

export interface Exchange {
  name: string;
  displayName: string;
  supportsFutures: boolean;
}

export interface SpotlightCoin {
  id: number;
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  discovery_date: string;
  source: string;
  market_cap?: number;
  volume_24h?: number;
  price_change_24h?: number;
  trending_score?: number;
  description?: string;
  metadata?: any;
  is_active: boolean;
  created_at: string;
}

export interface TradingPosition {
  id: number;
  user_id: number;
  signal_id: number;
  coin_id: string;
  coin_symbol: string;
  position_type: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  opened_at: string;
  closed_at: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
  exit_reason: string | null;
  pnl_usd: number | null;
  pnl_percent: number | null;
  user_feedback: 'GOOD' | 'BAD' | 'NEUTRAL' | null;
  user_rating: number | null;
  user_notes: string | null;
  feedback_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

export interface Backtest {
  id: number;
  coin_id: string;
  coin_symbol: string;
  start_date: string;
  end_date: string;
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
  created_at: string;
}

export interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
}

export interface NewsArticle {
  id: number;
  source: string;
  article_id: string;
  title: string;
  url: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  sentiment: string | null;
  coins_mentioned: string[];
  categories: string[];
  votes: number;
  is_trending: boolean;
  created_at: string;
}

export interface SocialMetrics {
  id: number;
  coin_id: string;
  coin_symbol: string;
  date: string;
  social_volume: number;
  social_sentiment: number;
  social_contributors: number;
  social_dominance: number;
  galaxy_score: number | null;
  alt_rank: number | null;
  reddit_posts: number;
  reddit_comments: number;
  reddit_score: number;
  created_at: string;
  updated_at: string;
}

// Auth APIs
export const authAPI = {
  register: (email: string, username: string, password: string) =>
    api.post('/api/auth/register', { email, username, password }),

  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),

  me: () => api.get('/api/auth/me'),
};

// Watchlist APIs
export const watchlistAPI = {
  getWatchlist: () => api.get<{ watchlist: WatchlistItem[] }>('/api/watchlist'),

  addCoin: (coin_id: string, coin_symbol: string, coin_name: string) =>
    api.post('/api/watchlist', { coin_id, coin_symbol, coin_name }),

  removeCoin: (id: number) => api.delete(`/api/watchlist/${id}`),

  toggleActive: (id: number, is_active: boolean) =>
    api.patch(`/api/watchlist/${id}`, { is_active }),

  getPrices: () => api.get<{ prices: CoinPrice[] }>('/api/watchlist/prices'),
};

// Coins APIs
export const coinsAPI = {
  search: (query?: string) =>
    api.get('/api/coins/search', { params: { query } }),
};

// Signals APIs
export const signalsAPI = {
  getSignals: (limit = 50, offset = 0) =>
    api.get<{ signals: Signal[] }>('/api/signals', { params: { limit, offset } }),

  getUnreadCount: () =>
    api.get<{ count: number }>('/api/signals/unread'),

  markAsRead: (id: number) =>
    api.patch(`/api/signals/${id}/read`),

  markAllAsRead: () =>
    api.post('/api/signals/read-all'),

  getCoinSignals: (coinId: string) =>
    api.get<{ signals: Signal[] }>(`/api/signals/coin/${coinId}`),
};

// Trading settings APIs
export const tradingAPI = {
  getSettings: () =>
    api.get<{ settings: TradingSettings }>('/api/trading/settings'),

  updateSettings: (payload: Partial<TradingSettings>) =>
    api.patch<{ settings: TradingSettings }>('/api/trading/settings', payload),

  getExchanges: () =>
    api.get<{ exchanges: Exchange[] }>('/api/trading/exchanges'),
};

// Spotlight coins APIs
export const spotlightAPI = {
  getCoins: () =>
    api.get<{ coins: SpotlightCoin[] }>('/api/spotlight/coins'),

  getMonitored: () =>
    api.get<{ coins: SpotlightCoin[] }>('/api/spotlight/monitored'),

  startMonitoring: (spotlight_coin_id: number) =>
    api.post('/api/spotlight/monitor', { spotlight_coin_id }),

  stopMonitoring: (spotlight_coin_id: number) =>
    api.delete(`/api/spotlight/monitor/${spotlight_coin_id}`),

  getHistory: (days = 7) =>
    api.get('/api/spotlight/history', { params: { days } }),
};

// Backtest APIs
export const backtestAPI = {
  run: (params: {
    coin_id: string;
    coin_symbol: string;
    start_date: string;
    end_date: string;
    initial_balance?: number;
    risk_percentage?: number;
    use_ai?: boolean;
    use_futures?: boolean;
  }) => api.post('/api/backtest/run', params),

  getHistory: () =>
    api.get<{ backtests: Backtest[] }>('/api/backtest/history'),

  getDetails: (id: number) =>
    api.get<{ backtest: Backtest }>(`/api/backtest/${id}`),

  delete: (id: number) =>
    api.delete(`/api/backtest/${id}`),
};

// News APIs
export const newsAPI = {
  getNews: () =>
    api.get<{ news: NewsArticle[] }>('/api/news'),

  getCoinNews: (coinSymbol: string) =>
    api.get<{ news: NewsArticle[] }>(`/api/news/coin/${coinSymbol}`),

  getTrendingNews: () =>
    api.get<{ news: NewsArticle[] }>('/api/news/trending'),

  getStats: () =>
    api.get('/api/news/stats'),
};

// Social Metrics APIs
export const socialAPI = {
  getCoinMetrics: (coinSymbol: string) =>
    api.get<{ metrics: SocialMetrics[] }>(`/api/social/${coinSymbol}`),

  getWatchlistMetrics: () =>
    api.get<{ metrics: SocialMetrics[] }>('/api/social/watchlist'),
};

// Trading Positions APIs
export const positionsAPI = {
  getPositions: (limit = 50, offset = 0, status?: 'ACTIVE' | 'CLOSED' | 'EXPIRED') =>
    api.get<{ positions: TradingPosition[] }>('/api/positions', {
      params: { limit, offset, status }
    }),

  getPosition: (id: number) =>
    api.get<{ position: TradingPosition }>(`/api/positions/${id}`),

  submitFeedback: (id: number, feedback: {
    user_feedback: 'GOOD' | 'BAD' | 'NEUTRAL';
    user_rating?: number;
    user_notes?: string;
  }) =>
    api.post(`/api/positions/${id}/feedback`, feedback),

  getStats: (days = 30) =>
    api.get('/api/positions/stats', { params: { days } }),
};

// ML Training APIs
export const mlAPI = {
  triggerTraining: (days = 30) =>
    api.post('/api/ml/train', { days }),

  getTrainingStatus: () =>
    api.get('/api/ml/status'),

  getModelInfo: () =>
    api.get('/api/ml/model-info'),
};

export default api;
