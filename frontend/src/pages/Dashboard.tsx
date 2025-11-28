import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signalsAPI, newsAPI, type Signal, type NewsArticle } from '../services/api';
import { useRealTimeSignals } from '../hooks/useRealTimeSignals';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [latestSignal, setLatestSignal] = useState<Signal | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(() => {
    return localStorage.getItem('aiEnhancementsEnabled') !== 'false';
  });
  // Force timezone to UTC+2 (WAT+1) - Africa/Cairo
  const [timezone] = useState(() => localStorage.getItem('timezone') || 'Africa/Cairo');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Real-time signal stream
  const { connected: streamConnected } = useRealTimeSignals({
    autoConnect: true,
    onSignal: (signal) => {
      console.log('📡 New signal received:', signal);
      // Update latest signal immediately
      setLatestSignal(signal);
      setLastRefresh(new Date());
    }
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadDashboard();

    // Note: No more polling! Real-time signals are delivered via SSE
    // Only refresh news periodically
    const newsRefreshInterval = setInterval(() => {
      loadNews();
    }, 15 * 60 * 1000); // 15 minutes for news

    return () => clearInterval(newsRefreshInterval);
  }, [user, navigate]);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Load latest signal and news in parallel
      const [signalsResponse, newsResponse] = await Promise.all([
        signalsAPI.getSignals(1, 0),
        newsAPI.getNews()
      ]);

      // Only set latest signal if we don't have real-time signals yet
      if (signalsResponse.data.signals && signalsResponse.data.signals.length > 0 && !latestSignal) {
        setLatestSignal(signalsResponse.data.signals[0]);
      }

      if (newsResponse.data.news && newsResponse.data.news.length > 0) {
        // Take top 15 most recent news articles
        setNews(newsResponse.data.news.slice(0, 15));
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNews = async () => {
    try {
      const newsResponse = await newsAPI.getNews();
      if (newsResponse.data.news && newsResponse.data.news.length > 0) {
        setNews(newsResponse.data.news.slice(0, 15));
      }
    } catch (error) {
      console.error('Failed to load news:', error);
    }
  };

  const toggleAiEnhancements = () => {
    const newValue = !aiEnabled;
    setAiEnabled(newValue);
    localStorage.setItem('aiEnhancementsEnabled', newValue.toString());
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
            {/* Real-time connection status */}
            <span style={{
              fontSize: '12px',
              color: streamConnected ? '#10b981' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '500'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: streamConnected ? '#10b981' : '#ef4444',
                animation: streamConnected ? 'pulse 2s infinite' : 'none'
              }}></span>
              {streamConnected ? '🟢 Live' : '🔴 Disconnected'}
            </span>
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

                <div className="signal-price-main">
                  {formatPrice(parseFloat(String(latestSignal.price)))}
                </div>

                <p className="signal-message">{latestSignal.message}</p>

                {/* Futures Trading Information */}
                {latestSignal.position && (
                  <div className="futures-info">
                    <div className="futures-row">
                      <div className="futures-item">
                        <span className="futures-label">Position</span>
                        <span className={`futures-value position-${latestSignal.position?.toLowerCase()}`}>
                          {latestSignal.position}
                        </span>
                      </div>
                      {latestSignal.leverage && (
                        <div className="futures-item">
                          <span className="futures-label">Leverage</span>
                          <span className="futures-value">{latestSignal.leverage}x</span>
                        </div>
                      )}
                    </div>
                    <div className="futures-row">
                      {latestSignal.entry_price && (
                        <div className="futures-item">
                          <span className="futures-label">Entry</span>
                          <span className="futures-value">{formatPrice(parseFloat(String(latestSignal.entry_price)))}</span>
                        </div>
                      )}
                      {latestSignal.stop_loss && (
                        <div className="futures-item">
                          <span className="futures-label">Stop Loss</span>
                          <span className="futures-value stop-loss">{formatPrice(parseFloat(String(latestSignal.stop_loss)))}</span>
                        </div>
                      )}
                      {latestSignal.take_profit && (
                        <div className="futures-item">
                          <span className="futures-label">Take Profit</span>
                          <span className="futures-value take-profit">{formatPrice(parseFloat(String(latestSignal.take_profit)))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="news-item"
                  >
                    <div className="news-header">
                      <span className="news-source">{item.source.toUpperCase()}</span>
                      <span className="news-time">{formatDate(item.published_at)}</span>
                    </div>
                    <h3 className="news-title">{item.title}</h3>
                    {item.content && <p className="news-summary">{item.content}</p>}
                    {item.coins_mentioned && item.coins_mentioned.length > 0 && (
                      <div className="news-coins">
                        {item.coins_mentioned.map((coin) => (
                          <span key={coin} className="coin-tag">{coin}</span>
                        ))}
                      </div>
                    )}
                    {item.is_trending && <span className="trending-badge">🔥 Trending</span>}
                  </a>
                ))
              ) : (
                <div className="empty-news">
                  <p>Loading news...</p>
                  <p className="hint">Aggregating from multiple sources</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
