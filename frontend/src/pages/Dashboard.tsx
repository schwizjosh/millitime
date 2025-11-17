import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signalsAPI, tradingAPI, type Signal, type TradingSettings } from '../services/api';
import '../styles/Dashboard.css';

interface NewsItem {
  id: number;
  title: string;
  source: string;
  timestamp: string;
  url?: string;
  summary?: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [latestSignal, setLatestSignal] = useState<Signal | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(() => {
    return localStorage.getItem('aiEnhancementsEnabled') !== 'false';
  });
  const [timezone] = useState(() => localStorage.getItem('timezone') || 'UTC');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tradingSettings, setTradingSettings] = useState<TradingSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [whatsappNumberInput, setWhatsappNumberInput] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadDashboard();
    loadTradingSettings();

    // Auto-refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      loadDashboard();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, [user, navigate]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await signalsAPI.getSignals(1, 0);
      if (response.data.signals && response.data.signals.length > 0) {
        setLatestSignal(response.data.signals[0]);
      }
      // TODO: Fetch FA news from API
      setNews([
        {
          id: 1,
          title: 'Federal Reserve maintains interest rates',
          source: 'Reuters',
          timestamp: new Date().toISOString(),
          summary: 'The Federal Reserve held interest rates steady as inflation shows signs of cooling.'
        },
        {
          id: 2,
          title: 'Major tech earnings beat expectations',
          source: 'Bloomberg',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          summary: 'Several tech giants reported stronger than expected quarterly earnings.'
        }
      ]);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTradingSettings = async () => {
    try {
      const response = await tradingAPI.getSettings();
      const settings = response.data.settings;
      setTradingSettings(settings);
      setWhatsappNumberInput(settings.whatsapp_number || '');
    } catch (error) {
      console.error('Failed to load trading settings:', error);
    }
  };

  const toggleAiEnhancements = () => {
    const newValue = !aiEnabled;
    setAiEnabled(newValue);
    localStorage.setItem('aiEnhancementsEnabled', newValue.toString());
  };

  const toggleAlgo = async () => {
    if (!tradingSettings) return;
    try {
      setSettingsSaving(true);
      const nextValue = !tradingSettings.algo_enabled;
      const response = await tradingAPI.updateSettings({ algo_enabled: nextValue });
      setTradingSettings(response.data.settings);
    } catch (error) {
      console.error('Failed to toggle algo:', error);
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleBackground = async () => {
    if (!tradingSettings) return;
    try {
      setSettingsSaving(true);
      const nextValue = !tradingSettings.run_in_background;
      const response = await tradingAPI.updateSettings({ run_in_background: nextValue });
      setTradingSettings(response.data.settings);
    } catch (error) {
      console.error('Failed to toggle background:', error);
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveWhatsappNumber = async () => {
    try {
      setSettingsSaving(true);
      const response = await tradingAPI.updateSettings({ whatsapp_number: whatsappNumberInput });
      setTradingSettings(response.data.settings);
    } catch (error) {
      console.error('Failed to save WhatsApp number:', error);
    } finally {
      setSettingsSaving(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price: number | undefined | null) => {
    if (typeof price !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  };

  const getSignalColor = (signalType: string) => {
    switch (signalType) {
      case 'BUY': return '#10b981';
      case 'SELL': return '#ef4444';
      case 'HOLD': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="mobile-overlay" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="url(#gradient)" fillOpacity="0.2"/>
              <path d="M24 12L32 20L24 28L16 20L24 12Z" fill="white" fillOpacity="0.9"/>
              <path d="M24 20L32 28L24 36L16 28L24 20Z" fill="white" fillOpacity="0.6"/>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="48" y2="48">
                  <stop stopColor="#8B5CF6"/>
                  <stop offset="1" stopColor="#6366F1"/>
                </linearGradient>
              </defs>
            </svg>
            <span className="logo-text">Millitime</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <Link to="/" className="nav-item active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Dashboard</span>
          </Link>

          <Link to="/watchlist" className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span>Watchlist</span>
          </Link>

          <Link to="/signals" className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span>Signals</span>
          </Link>

          <Link to="/settings" className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m8.66-12l-5.2 3m-2.92 1.68l-5.2 3M21 12h-6m-6 0H3m17.66 6l-5.2-3m-2.92-1.68l-5.2-3"></path>
            </svg>
            <span>Settings</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div className="user-info">
              <span className="user-name">{user?.username}</span>
              <button onClick={logout} className="logout-btn">Logout</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <section className="trading-controls">
          <div className="controls-left">
            <div className="controls-header">
              <h2>Active Trading</h2>
              <p>Control the algo and background alerts for this account.</p>
            </div>
            <div className="control-row">
              <div className="control-label">
                <span className="control-title">Algo</span>
                <small>Large on/off switch for live signal generation</small>
              </div>
              <button
                className={`pill-toggle ${tradingSettings?.algo_enabled ? 'on' : 'off'}`}
                onClick={toggleAlgo}
                disabled={settingsSaving || !tradingSettings}
              >
                <span className="pill-thumb">{tradingSettings?.algo_enabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            <div className="control-row">
              <div className="control-label">
                <span className="control-title">Run in background</span>
                <small>Keep WhatsApp alerts flowing even when the app is closed</small>
              </div>
              <label className="toggle-switch-minimal">
                <input
                  type="checkbox"
                  checked={tradingSettings?.run_in_background ?? true}
                  onChange={toggleBackground}
                  disabled={settingsSaving || !tradingSettings}
                />
                <span className="toggle-slider-minimal"></span>
              </label>
            </div>
          </div>

          <div className="controls-right">
            <div className="controls-header">
              <h3>WhatsApp Alerts</h3>
              <small>Uses Deluxe CRM messaging API</small>
            </div>
            <label className="input-label" htmlFor="whatsapp-number">Destination number</label>
            <input
              id="whatsapp-number"
              type="tel"
              placeholder="+15551234567"
              value={whatsappNumberInput}
              onChange={(e) => setWhatsappNumberInput(e.target.value)}
            />
            <button
              className="save-button"
              onClick={saveWhatsappNumber}
              disabled={settingsSaving}
            >
              {settingsSaving ? 'Saving...' : 'Save & enable alerts'}
            </button>
            <p className="helper-text">
              Notifications fire on signal changes. Set your Deluxe CRM API key in backend env or per-user settings.
            </p>
          </div>
        </section>

        {/* Minimal Header with AI Toggle */}
        <header className="minimal-header">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Updated {formatDate(lastRefresh.toISOString())}
            </span>
            <div className="ai-toggle-minimal">
              <span className="ai-label">AI</span>
              <label className="toggle-switch-minimal">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={toggleAiEnhancements}
                />
                <span className="toggle-slider-minimal"></span>
              </label>
            </div>
          </div>
        </header>

        {/* 2-Column Layout: Signal + FA News */}
        <div className="dashboard-grid">
          {/* Left Column: Latest Signal */}
          <div className="signal-column">
            <h2 className="column-title">Latest Signal</h2>
            {latestSignal ? (
              <div className="signal-card-main">
                <div className="signal-header-main">
                  <div className="signal-coin">
                    <span className="signal-symbol">{latestSignal.coin_symbol.toUpperCase()}</span>
                    <span
                      className="signal-badge"
                      style={{ backgroundColor: getSignalColor(latestSignal.signal_type) }}
                    >
                      {latestSignal.signal_type}
                    </span>
                  </div>
                  <span className="signal-time">{formatDate(latestSignal.created_at)}</span>
                </div>

                <div className="signal-price-main">{formatPrice(latestSignal.price)}</div>

                <p className="signal-message">{latestSignal.message}</p>

                {latestSignal.strength && (
                  <div className="signal-strength">
                    <span>Strength: </span>
                    <strong>{latestSignal.strength}</strong>
                  </div>
                )}

                {latestSignal.indicators && (
                  <div className="signal-indicators">
                    {latestSignal.indicators.rsi && (
                      <div className="indicator">
                        <span className="indicator-label">RSI</span>
                        <span className="indicator-value">
                          {typeof latestSignal.indicators.rsi === 'number' ? latestSignal.indicators.rsi.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                    )}
                    {latestSignal.indicators.macd && (
                      <div className="indicator">
                        <span className="indicator-label">MACD</span>
                        <span className="indicator-value">
                          {typeof latestSignal.indicators.macd.MACD === 'number' ? latestSignal.indicators.macd.MACD.toFixed(4) : 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-signal">
                <p>No signals yet</p>
                <p className="hint">Add coins to your watchlist to start receiving signals</p>
              </div>
            )}
          </div>

          {/* Right Column: FA News */}
          <div className="fa-column">
            <h2 className="column-title">Fundamental Analysis</h2>
            <div className="news-feed">
              {news.length > 0 ? (
                news.map((item) => (
                  <div key={item.id} className="news-item">
                    <div className="news-header">
                      <span className="news-source">{item.source}</span>
                      <span className="news-time">{formatDate(item.timestamp)}</span>
                    </div>
                    <h3 className="news-title">{item.title}</h3>
                    {item.summary && <p className="news-summary">{item.summary}</p>}
                  </div>
                ))
              ) : (
                <div className="empty-news">
                  <p>News feed coming soon</p>
                  <p className="hint">Market events and fundamental data will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
