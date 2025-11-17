import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { watchlistAPI, coinsAPI, type WatchlistItem, type CoinPrice } from '../services/api';
import '../styles/Watchlist.css';

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [prices, setPrices] = useState<CoinPrice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWatchlist();
  }, []);

  const loadWatchlist = async () => {
    try {
      setLoading(true);
      const [watchlistRes, pricesRes] = await Promise.all([
        watchlistAPI.getWatchlist(),
        watchlistAPI.getPrices()
      ]);
      setWatchlist(watchlistRes.data.watchlist);
      setPrices(pricesRes.data.prices);
    } catch (error) {
      console.error('Failed to load watchlist:', error);
      setError('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
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

  const getPriceForCoin = (coinId: string): CoinPrice | undefined => {
    return prices.find((p) => p.id === coinId);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading watchlist...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="watchlist-container">
        <div className="watchlist-header">
          <h1>Watchlist</h1>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {/* Search Section */}
        <div className="search-card">
          <h2>Add Cryptocurrency</h2>
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search for coins (e.g., bitcoin, ethereum)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="search-button"
            >
              {searching ? 'Searching...' : 'Search'}
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
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist Grid */}
        <h2>Your Watchlist</h2>
        {watchlist.length === 0 ? (
          <div className="empty-state">
            <p>Your watchlist is empty</p>
            <p className="hint">Search and add cryptocurrencies above to start monitoring</p>
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
                      ×
                    </button>
                  </div>

                  {priceData && (
                    <div className="price-section">
                      <div className="current-price">{formatPrice(priceData.current_price)}</div>
                      <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
                        {isPositive ? '▲' : '▼'} {Math.abs(priceData.price_change_percentage_24h).toFixed(2)}%
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
                      {item.is_active ? 'Monitoring' : 'Paused'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
