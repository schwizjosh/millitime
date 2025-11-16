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
  const [activeTab, setActiveTab] = useState<'watchlist' | 'signals'>('watchlist');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    loadDashboard();
    const interval = setInterval(loadPrices, 60000); // Refresh prices every minute

    return () => clearInterval(interval);
  }, [user, navigate]);

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

  const loadSignals = async () => {
    const response = await signalsAPI.getSignals(20, 0);
    setSignals(response.data.signals);
  };

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
      alert(err.response?.data?.error || 'Failed to add coin');
    }
  };

  const handleRemoveCoin = async (id: number) => {
    if (!confirm('Remove this coin from your watchlist?')) return;

    try {
      await watchlistAPI.removeCoin(id);
      await loadWatchlist();
      await loadPrices();
    } catch (err) {
      alert('Failed to remove coin');
    }
  };

  const handleToggleActive = async (id: number, is_active: boolean) => {
    try {
      await watchlistAPI.toggleActive(id, !is_active);
      await loadWatchlist();
    } catch (err) {
      alert('Failed to update coin');
    }
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
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Crypto Signals Bot</h1>
        <div className="header-actions">
          <span>Welcome, {user?.username}</span>
          <button onClick={logout} className="btn-secondary">
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'watchlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('watchlist')}
        >
          Watchlist ({watchlist.length})
        </button>
        <button
          className={`tab ${activeTab === 'signals' ? 'active' : ''}`}
          onClick={() => setActiveTab('signals')}
        >
          Signals {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {activeTab === 'watchlist' && (
        <div className="watchlist-section">
          <div className="search-section">
            <h2>Add Coins to Watchlist</h2>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search for coins (e.g., bitcoin, ethereum)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button onClick={handleSearch} disabled={searching} className="btn-primary">
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.slice(0, 10).map((coin) => (
                  <div key={coin.id} className="search-result-item">
                    <div>
                      <strong>{coin.name}</strong> ({coin.symbol?.toUpperCase()})
                    </div>
                    <button onClick={() => handleAddCoin(coin)} className="btn-small">
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="watchlist-grid">
            <h2>Your Watchlist</h2>
            {watchlist.length === 0 ? (
              <p className="empty-message">
                No coins in your watchlist. Search and add coins above to start monitoring.
              </p>
            ) : (
              <div className="coin-cards">
                {watchlist.map((item) => {
                  const priceData = getPriceForCoin(item.coin_id);
                  return (
                    <div key={item.id} className={`coin-card ${!item.is_active ? 'inactive' : ''}`}>
                      <div className="coin-header">
                        <h3>{item.coin_name}</h3>
                        <span className="coin-symbol">{item.coin_symbol.toUpperCase()}</span>
                      </div>

                      {priceData && (
                        <div className="coin-price-info">
                          <div className="price">{formatPrice(priceData.current_price)}</div>
                          <div
                            className={`price-change ${
                              priceData.price_change_percentage_24h >= 0 ? 'positive' : 'negative'
                            }`}
                          >
                            {priceData.price_change_percentage_24h >= 0 ? '▲' : '▼'}{' '}
                            {Math.abs(priceData.price_change_percentage_24h).toFixed(2)}%
                          </div>
                          <div className="volume">
                            Vol: {formatPrice(priceData.total_volume)}
                          </div>
                        </div>
                      )}

                      <div className="coin-actions">
                        <button
                          onClick={() => handleToggleActive(item.id, item.is_active)}
                          className={`btn-toggle ${item.is_active ? 'active' : ''}`}
                        >
                          {item.is_active ? 'Monitoring' : 'Paused'}
                        </button>
                        <button
                          onClick={() => handleRemoveCoin(item.id)}
                          className="btn-danger-small"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'signals' && (
        <div className="signals-section">
          <h2>Trading Signals</h2>
          {signals.length === 0 ? (
            <p className="empty-message">
              No signals yet. Add coins to your watchlist and the bot will analyze them and generate
              signals.
            </p>
          ) : (
            <div className="signals-list">
              {signals.map((signal) => (
                <div
                  key={signal.id}
                  className={`signal-card ${getSignalColor(signal.signal_type)} ${
                    !signal.is_read ? 'unread' : ''
                  }`}
                  onClick={() => !signal.is_read && handleMarkAsRead(signal.id)}
                >
                  <div className="signal-header">
                    <div className="signal-coin">
                      <strong>{signal.coin_symbol.toUpperCase()}</strong>
                      <span className={`signal-type ${signal.signal_type.toLowerCase()}`}>
                        {signal.signal_type}
                      </span>
                      <span className={`signal-strength ${signal.strength?.toLowerCase()}`}>
                        {signal.strength}
                      </span>
                    </div>
                    <div className="signal-time">{formatDate(signal.created_at)}</div>
                  </div>

                  <div className="signal-message">{signal.message}</div>

                  <div className="signal-details">
                    <div>Price: {formatPrice(signal.price)}</div>
                    {signal.indicators?.rsi && (
                      <div>RSI: {signal.indicators.rsi.toFixed(2)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
