import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { spotlightAPI, SpotlightCoin } from '../services/api';
import '../styles/SpotlightCoins.css';

export default function SpotlightCoins() {
  const [coins, setCoins] = useState<SpotlightCoin[]>([]);
  const [monitoredCoins, setMonitoredCoins] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCoins();
    const interval = setInterval(loadCoins, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const loadCoins = async () => {
    try {
      setLoading(true);
      const [coinsResponse, monitoredResponse] = await Promise.all([
        spotlightAPI.getCoins(),
        spotlightAPI.getMonitored(),
      ]);

      setCoins(coinsResponse.data.coins);
      const monitoredIds = new Set(monitoredResponse.data.coins.map((c) => c.id));
      setMonitoredCoins(monitoredIds);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load spotlight coins');
    } finally {
      setLoading(false);
    }
  };

  const handleMonitor = async (coinId: number) => {
    try {
      if (monitoredCoins.has(coinId)) {
        await spotlightAPI.stopMonitoring(coinId);
        setMonitoredCoins((prev) => {
          const newSet = new Set(prev);
          newSet.delete(coinId);
          return newSet;
        });
      } else {
        await spotlightAPI.startMonitoring(coinId);
        setMonitoredCoins((prev) => new Set(prev).add(coinId));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update monitoring');
    }
  };

  const getTrendingBadgeColor = (score?: number) => {
    if (!score) return '#6b7280';
    if (score >= 90) return '#10b981';
    if (score >= 75) return '#3b82f6';
    if (score >= 60) return '#f59e0b';
    return '#6b7280';
  };

  return (
    <Layout>
      <div className="spotlight-container">
        <div className="spotlight-header">
          <h1>Spotlight Coins</h1>
          <p className="subtitle">
            Daily discovered trending coins based on fundamental analysis, social sentiment, and AI insights
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading && coins.length === 0 ? (
          <div className="loading">Loading spotlight coins...</div>
        ) : (
          <div className="spotlight-grid">
            {coins.map((coin) => (
              <div key={coin.id} className="coin-card">
                <div className="coin-header">
                  <div className="coin-title">
                    <h3>{coin.coin_symbol.toUpperCase()}</h3>
                    <p className="coin-name">{coin.coin_name}</p>
                  </div>
                  <div
                    className="trending-badge"
                    style={{ backgroundColor: getTrendingBadgeColor(coin.trending_score) }}
                  >
                    {coin.trending_score || 'N/A'}
                  </div>
                </div>

                <div className="coin-details">
                  {coin.description && (
                    <p className="coin-description">{coin.description}</p>
                  )}

                  <div className="coin-stats">
                    {coin.price_change_24h !== undefined && coin.price_change_24h !== null && (
                      <div className="stat">
                        <span className="stat-label">24h Change</span>
                        <span
                          className={`stat-value ${coin.price_change_24h > 0 ? 'positive' : 'negative'}`}
                        >
                          {coin.price_change_24h > 0 ? '+' : ''}
                          {coin.price_change_24h.toFixed(2)}%
                        </span>
                      </div>
                    )}

                    {coin.volume_24h && (
                      <div className="stat">
                        <span className="stat-label">24h Volume</span>
                        <span className="stat-value">
                          ${(coin.volume_24h / 1000000).toFixed(2)}M
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="coin-source">
                    Source: {coin.source.split(',').map(s => {
                      const formatted = s.replace(/_/g, ' ');
                      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                    }).join(', ')}
                  </div>
                </div>

                <button
                  className={`monitor-button ${monitoredCoins.has(coin.id) ? 'monitoring' : ''}`}
                  onClick={() => handleMonitor(coin.id)}
                >
                  {monitoredCoins.has(coin.id) ? 'Stop Monitoring' : 'Start Monitoring'}
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && coins.length === 0 && (
          <div className="empty-state">
            <p>No spotlight coins discovered today. Check back tomorrow!</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
