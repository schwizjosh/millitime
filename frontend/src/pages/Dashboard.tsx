import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  watchlistAPI,
  coinsAPI,
  signalsAPI,
  type WatchlistItem,
  type Signal,
  type CoinPrice,
} from '../services/api';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [prices, setPrices] = useState<CoinPrice[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'watchlist' | 'signals' | 'settings'>('watchlist');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [aiEnhancementsEnabled, setAiEnhancementsEnabled] = useState(true);
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Load settings from localStorage
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    const savedTimezone = localStorage.getItem('timezone') || 'UTC';
    const savedEmailNotifications = localStorage.getItem('emailNotifications') !== 'false';
    const savedPushNotifications = localStorage.getItem('pushNotifications') === 'true';
    const savedAiEnhancements = localStorage.getItem('aiEnhancementsEnabled');

    setDarkMode(savedDarkMode);
    setTimezone(savedTimezone);
    setEmailNotifications(savedEmailNotifications);
    setPushNotifications(savedPushNotifications);
    setAiEnhancementsEnabled(savedAiEnhancements === null ? true : savedAiEnhancements === 'true');

    // Apply dark mode
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }

    loadDashboard();
    const interval = setInterval(loadPrices, 60000); // Refresh prices every minute

    setSettingsInitialized(true);

    return () => clearInterval(interval);
  }, [user, navigate]);

  // Dark mode toggle handler
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());

    if (newDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  // Save settings handler
  const saveSettings = () => {
    localStorage.setItem('timezone', timezone);
    localStorage.setItem('emailNotifications', emailNotifications.toString());
    localStorage.setItem('pushNotifications', pushNotifications.toString());
    setError('');
    setSettingsMessage('Settings saved successfully!');
    setTimeout(() => setSettingsMessage(''), 2500);
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      await Promise.all([loadWatchlist(), loadPrices(), loadSignals(), loadUnreadCount()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadWatchlist = async () => {
    const response = await watchlistAPI.getWatchlist();
    setWatchlist(response.data.watchlist);
  };

  const loadPrices = async () => {
    try {
      const response = await watchlistAPI.getPrices();
      setPrices(response.data.prices);
    } catch (err) {
      console.error('Failed to load prices:', err);
    }
  };

  const loadSignals = async (limit?: number) => {
    const response = await signalsAPI.getSignals(limit ?? (aiEnhancementsEnabled ? 50 : 20), 0);
    setSignals(response.data.signals);
  };

  useEffect(() => {
    if (settingsInitialized) {
      loadSignals();
    }
  }, [aiEnhancementsEnabled, settingsInitialized]);

  const loadUnreadCount = async () => {
    const response = await signalsAPI.getUnreadCount();
    setUnreadCount(response.data.count);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await coinsAPI.search(searchQuery);
      setSearchResults(response.data.coins || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleAddCoin = async (coin: any) => {
    try {
      await watchlistAPI.addCoin(coin.id, coin.symbol, coin.name);
      await loadWatchlist();
      setSearchQuery('');
      setSearchResults([]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add coin');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleRemoveCoin = async (id: number) => {
    try {
      await watchlistAPI.removeCoin(id);
      await loadWatchlist();
      await loadPrices();
    } catch (err) {
      setError('Failed to remove coin');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleToggleActive = async (id: number, is_active: boolean) => {
    try {
      await watchlistAPI.toggleActive(id, !is_active);
      await loadWatchlist();
    } catch (err) {
      setError('Failed to update coin');
      setTimeout(() => setError(''), 3000);
    }
  };

  const toggleAiEnhancements = () => {
    setAiEnhancementsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('aiEnhancementsEnabled', next.toString());
      return next;
    });
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await signalsAPI.markAsRead(id);
      await loadSignals();
      await loadUnreadCount();
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const getPriceForCoin = (coinId: string): CoinPrice | undefined => {
    return prices.find((p) => p.id === coinId);
  };

  const getSignalColor = (signalType: string) => {
    switch (signalType) {
      case 'BUY':
        return 'signal-buy';
      case 'SELL':
        return 'signal-sell';
      case 'HOLD':
        return 'signal-hold';
      default:
        return '';
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPortfolioStats = () => {
    const activeCoins = watchlist.filter(item => item.is_active).length;
    const totalCoins = watchlist.length;
    const recentSignals = signals.filter(s => {
      const signalDate = new Date(s.created_at);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return signalDate > oneDayAgo;
    }).length;

    return { activeCoins, totalCoins, recentSignals };
  };

  const stats = getPortfolioStats();

  // Comprehensive timezone list
  const timezones = [
    'UTC',
    'Africa/Abidjan',
    'Africa/Accra',
    'Africa/Addis_Ababa',
    'Africa/Algiers',
    'Africa/Cairo',
    'Africa/Casablanca',
    'Africa/Johannesburg',
    'Africa/Lagos',
    'Africa/Nairobi',
    'America/Anchorage',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Mexico_City',
    'America/New_York',
    'America/Sao_Paulo',
    'America/Toronto',
    'Asia/Bangkok',
    'Asia/Dubai',
    'Asia/Hong_Kong',
    'Asia/Jakarta',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Manila',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Melbourne',
    'Australia/Sydney',
    'Europe/Amsterdam',
    'Europe/Berlin',
    'Europe/Istanbul',
    'Europe/London',
    'Europe/Moscow',
    'Europe/Paris',
    'Europe/Rome',
    'Pacific/Auckland',
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner">
          <svg className="spinner" width="48" height="48" viewBox="0 0 24 24">
            <circle className="spinner-circle" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          </svg>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Get latest signal
  const latestSignal = signals.length > 0 ? signals[0] : null;

  return (
    <div className="dashboard">
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="url(#gradientSidebar)" fillOpacity="0.2"/>
              <path d="M24 12L32 20L24 28L16 20L24 12Z" fill="white" fillOpacity="0.9"/>
              <path d="M24 20L32 28L24 36L16 28L24 20Z" fill="white" fillOpacity="0.6"/>
              <defs>
                <linearGradient id="gradientSidebar" x1="0" y1="0" x2="48" y2="48">
                  <stop stopColor="#8B5CF6"/>
                  <stop offset="1" stopColor="#6366F1"/>
                </linearGradient>
              </defs>
            </svg>
            {!sidebarCollapsed && <span className="logo-text">Millitime</span>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'watchlist' ? 'active' : ''}`}
            onClick={() => setActiveTab('watchlist')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            {!sidebarCollapsed && <span>Watchlist</span>}
            {!sidebarCollapsed && watchlist.length > 0 && (
              <span className="nav-badge">{watchlist.length}</span>
            )}
          </button>

          <button
            className={`nav-item ${activeTab === 'signals' ? 'active' : ''}`}
            onClick={() => setActiveTab('signals')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            {!sidebarCollapsed && <span>Signals</span>}
            {!sidebarCollapsed && unreadCount > 0 && (
              <span className="nav-badge notification">{unreadCount}</span>
            )}
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m8.66-12l-5.2 3m-2.92 1.68l-5.2 3M21 12h-6m-6 0H3m17.66 6l-5.2-3m-2.92-1.68l-5.2-3"></path>
            </svg>
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div className="user-info">
                <span className="user-name">{user?.username}</span>
                <button onClick={logout} className="logout-btn">Logout</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="page-header">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <div className="header-title">
            <h1 className="desktop-title">
              {activeTab === 'watchlist' ? 'Portfolio Watchlist' : activeTab === 'signals' ? 'Trading Signals' : 'Settings'}
            </h1>
            <h1 className="mobile-title">Millitime</h1>
            <p className="header-subtitle desktop-subtitle">
              {activeTab === 'watchlist'
                ? 'Track and monitor your cryptocurrency portfolio in real-time'
                : activeTab === 'signals'
                ? 'AI-powered trading signals based on multi-indicator confluence'
                : 'Customize your experience'}
            </p>
          </div>
        </header>

        {/* Error / Success Messages */}
        {error && (
          <div className="alert error-alert">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
            {error}
          </div>
        )}

        {settingsMessage && (
          <div className="alert success-alert">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M16.707 7.293a1 1 0 00-1.414-1.414L9 12.172 6.707 9.879a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l7-7z" />
            </svg>
            {settingsMessage}
          </div>
        )}

        {/* Content Area */}
        <div className="content-area">
          {/* Latest Signal - PRIORITY #1 */}
          {latestSignal && (
            <div className="latest-signal-hero">
              <div className="hero-header">
                <h2>Latest Signal</h2>
                <span className="signal-time">{formatDate(latestSignal.created_at)}</span>
              </div>
              <div className={`hero-signal ${getSignalColor(latestSignal.signal_type)}`}>
                <div className="hero-coin-info">
                  <span className="hero-symbol">{latestSignal.coin_symbol.toUpperCase()}</span>
                  <span className={`hero-signal-badge ${latestSignal.signal_type.toLowerCase()}`}>
                    {latestSignal.signal_type}
                  </span>
                  {latestSignal.strength && (
                    <span className={`hero-strength ${latestSignal.strength.toLowerCase()}`}>
                      {latestSignal.strength} Signal
                    </span>
                  )}
                </div>
                <div className="hero-price">{formatPrice(latestSignal.price)}</div>
                <p className="hero-message">{latestSignal.message}</p>
                <div className="hero-metrics">
                  {latestSignal.indicators?.rsi && (
                    <div className="hero-metric">
                      <span className="metric-label">RSI</span>
                      <span className="metric-value">{latestSignal.indicators.rsi.toFixed(2)}</span>
                    </div>
                  )}
                  {latestSignal.indicators?.macd && (
                    <div className="hero-metric">
                      <span className="metric-label">MACD</span>
                      <span className="metric-value">{latestSignal.indicators.macd.MACD?.toFixed(4) || 'N/A'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI Actions - PRIORITY #2 */}
          <div className="ai-actions-section">
            <div className="ai-section-header">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
                AI Analysis
              </h2>
              <span className={`ai-status ${aiEnhancementsEnabled ? 'active' : 'inactive'}`}>
                {aiEnhancementsEnabled ? 'Enhanced insights enabled' : 'Standard mode'}
              </span>
            </div>
            <div className="ai-toggle-card">
              <div>
                <h3>AI Enhancements</h3>
                <p>Boost signal depth with contextual AI summaries and deeper indicator stacks.</p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={aiEnhancementsEnabled} onChange={toggleAiEnhancements} />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p className="ai-helper-text">
              {aiEnhancementsEnabled
                ? 'Signals now include extended confluence checks, higher history depth, and richer commentary.'
                : 'Switch on AI enhancements to unlock extended confluence checks and upgraded copy.'}
            </p>
          </div>

          {/* FA News - PRIORITY #3 */}
          <div className="fa-news-section">
            <h2 className="section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              Fundamental Analysis
            </h2>
            <div className="news-placeholder">
              <p>News feed coming soon - tracking market events, announcements, and fundamental data</p>
            </div>
          </div>

          {/* Quick Stats - Moved down */}
          <div className="quick-stats">
            <div className="stat-mini">
              <span className="stat-label">Active</span>
              <span className="stat-value">{stats.activeCoins}/{stats.totalCoins}</span>
            </div>
            <div className="stat-mini">
              <span className="stat-label">24h Signals</span>
              <span className="stat-value">{stats.recentSignals}</span>
            </div>
            <div className="stat-mini">
              <span className="stat-label">Unread</span>
              <span className="stat-value">{unreadCount}</span>
            </div>
          </div>
          {activeTab === 'watchlist' && (
            <>
              {/* Search Section */}
              <div className="search-card">
                <h2 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                  Add Cryptocurrency
                </h2>
                <div className="search-container">
                  <div className="search-input-wrapper">
                    <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search for coins (e.g., bitcoin, ethereum, cardano)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      className="search-button"
                    >
                      {searching ? (
                        <svg className="spinner-small" width="16" height="16" viewBox="0 0 24 24">
                          <circle className="spinner-circle" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        </svg>
                      ) : 'Search'}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="search-results">
                      {searchResults.slice(0, 10).map((coin) => (
                        <div key={coin.id} className="search-result-item">
                          <div className="result-info">
                            <span className="result-name">{coin.name}</span>
                            <span className="result-symbol">{coin.symbol?.toUpperCase()}</span>
                          </div>
                          <button
                            onClick={() => handleAddCoin(coin)}
                            className="add-btn"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Watchlist Grid */}
              <div className="watchlist-container">
                <h2 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                  Your Watchlist
                </h2>

                {watchlist.length === 0 ? (
                  <div className="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3>No coins in your watchlist</h3>
                    <p>Search and add cryptocurrencies above to start monitoring their performance</p>
                  </div>
                ) : (
                  <div className="coin-grid">
                    {watchlist.map((item) => {
                      const priceData = getPriceForCoin(item.coin_id);
                      const isPositive = priceData && priceData.price_change_percentage_24h >= 0;

                      return (
                        <div
                          key={item.id}
                          className={`crypto-card ${!item.is_active ? 'inactive' : ''}`}
                        >
                          <div className="card-header">
                            <div className="coin-info">
                              <h3 className="coin-name">{item.coin_name}</h3>
                              <span className="coin-badge">{item.coin_symbol.toUpperCase()}</span>
                            </div>
                            <button
                              onClick={() => handleRemoveCoin(item.id)}
                              className="remove-btn"
                              title="Remove from watchlist"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>

                          {priceData && (
                            <div className="price-section">
                              <div className="current-price">{formatPrice(priceData.current_price)}</div>
                              <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  {isPositive ? (
                                    <path d="M7 14l5-5 5 5z"/>
                                  ) : (
                                    <path d="M7 10l5 5 5-5z"/>
                                  )}
                                </svg>
                                {Math.abs(priceData.price_change_percentage_24h).toFixed(2)}%
                              </div>
                            </div>
                          )}

                          {priceData && (
                            <div className="price-details">
                              <div className="detail-row">
                                <span className="detail-label">24h Volume</span>
                                <span className="detail-value">{formatPrice(priceData.total_volume)}</span>
                              </div>
                              <div className="detail-row">
                                <span className="detail-label">Market Cap</span>
                                <span className="detail-value">{formatPrice(priceData.market_cap)}</span>
                              </div>
                            </div>
                          )}

                          <div className="card-actions">
                            <button
                              onClick={() => handleToggleActive(item.id, item.is_active)}
                              className={`status-toggle ${item.is_active ? 'active' : 'inactive'}`}
                            >
                              <div className="toggle-indicator"></div>
                              {item.is_active ? 'Monitoring' : 'Paused'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'signals' && (
            <div className="signals-container">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                Recent Trading Signals
              </h2>

              {signals.length === 0 ? (
                <div className="empty-state">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                  </svg>
                  <h3>No signals generated yet</h3>
                  <p>Add coins to your watchlist and enable monitoring to start receiving AI-powered trading signals</p>
                </div>
              ) : (
                <div className="signals-list">
                  {signals.map((signal) => {
                    const signalClass = getSignalColor(signal.signal_type);

                    return (
                      <div
                        key={signal.id}
                        className={`signal-item ${signalClass} ${!signal.is_read ? 'unread' : ''}`}
                        onClick={() => !signal.is_read && handleMarkAsRead(signal.id)}
                      >
                        {!signal.is_read && <div className="unread-indicator"></div>}

                        <div className="signal-content">
                          <div className="signal-header">
                            <div className="signal-coin-info">
                              <span className="signal-symbol">{signal.coin_symbol.toUpperCase()}</span>
                              <span className={`signal-type-badge ${signal.signal_type.toLowerCase()}`}>
                                {signal.signal_type}
                              </span>
                              {signal.strength && (
                                <span className={`signal-strength-badge ${signal.strength.toLowerCase()}`}>
                                  {signal.strength}
                                </span>
                              )}
                            </div>
                            <div className="signal-time">{formatDate(signal.created_at)}</div>
                          </div>

                          <p className="signal-message">{signal.message}</p>

                          <div className="signal-metrics">
                            <div className="metric">
                              <span className="metric-label">Price</span>
                              <span className="metric-value">{formatPrice(signal.price)}</span>
                            </div>
                            {signal.indicators?.rsi && (
                              <div className="metric">
                                <span className="metric-label">RSI</span>
                                <span className="metric-value">{signal.indicators.rsi.toFixed(2)}</span>
                              </div>
                            )}
                            {signal.indicators?.macd && (
                              <div className="metric">
                                <span className="metric-label">MACD</span>
                                <span className="metric-value">{signal.indicators.macd.MACD?.toFixed(4) || 'N/A'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="settings-container-dash">
              {/* Account Section */}
              <div className="settings-section">
                <h2 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  Account
                </h2>
                <div className="settings-group">
                  <div className="setting-item">
                    <label>Username</label>
                    <input type="text" value={user?.username || ''} disabled />
                  </div>
                  <div className="setting-item">
                    <label>Email</label>
                    <input type="email" value={user?.email || ''} disabled />
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <div className="settings-section">
                <h2 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5"></circle>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
                  </svg>
                  Appearance
                </h2>
                <div className="settings-group">
                  <div className="setting-item toggle-item">
                    <div>
                      <label>Dark Mode</label>
                      <p className="setting-description">Enable dark theme for better viewing at night</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={darkMode}
                        onChange={() => toggleDarkMode()}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Regional Settings */}
              <div className="settings-section">
                <h2 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Regional Settings
                </h2>
                <div className="settings-group">
                  <div className="setting-item">
                    <label>Timezone</label>
                    <p className="setting-description">Set your timezone for accurate signal timestamps</p>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {timezones.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Notifications */}
              <div className="settings-section">
                <h2 className="section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                  Notifications
                </h2>
                <div className="settings-group">
                  <div className="setting-item toggle-item">
                    <div>
                      <label>Email Notifications</label>
                      <p className="setting-description">Receive trading signals via email</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={emailNotifications}
                        onChange={(e) => setEmailNotifications(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item toggle-item">
                    <div>
                      <label>Push Notifications</label>
                      <p className="setting-description">Get instant alerts for new signals</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={pushNotifications}
                        onChange={(e) => setPushNotifications(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="settings-actions">
                <button onClick={saveSettings} className="btn-save">
                  Save Changes
                </button>
                <button onClick={logout} className="btn-logout">
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
