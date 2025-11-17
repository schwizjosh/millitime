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
}

export interface TradingSettings {
  algo_enabled: boolean;
  run_in_background: boolean;
  whatsapp_number: string | null;
  whatsapp_api_key: string | null;
  updated_at: string;
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
};

export default api;
