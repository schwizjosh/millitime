import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { signalsAPI, type Signal } from '../services/api';
import '../styles/SignalsHistory.css';

export default function SignalsHistory() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');
  const [timezone] = useState(() => localStorage.getItem('timezone') || 'UTC');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    fetchSignals();

    // Auto-refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      fetchSignals();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  const fetchSignals = async () => {
    try {
      const response = await signalsAPI.getSignals(100, 0);
      setSignals(response.data.signals || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BUY': return '#10b981';
      case 'SELL': return '#ef4444';
      case 'HOLD': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const filteredSignals = filter === 'ALL'
    ? signals
    : signals.filter(s => s.signal_type === filter);

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading signals...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="signals-history-container">
      <div className="signals-header">
        <div>
          <h1>Signal History</h1>
          <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            Updated {formatDate(lastRefresh.toISOString())} • Refreshes every 5min
          </span>
        </div>
        <div className="filter-buttons">
          {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map((filterType) => (
            <button
              key={filterType}
              className={`filter-button ${filter === filterType ? 'active' : ''}`}
              onClick={() => setFilter(filterType)}
            >
              {filterType}
            </button>
          ))}
        </div>
      </div>

      <div className="signals-list">
        {filteredSignals.length === 0 ? (
          <div className="empty-state">
            <p>No signals found</p>
            <p className="hint">Signals will appear here as they are generated</p>
          </div>
        ) : (
          filteredSignals.map((signal) => (
            <div key={signal.id} className="signal-card">
              <div className="signal-header">
                <div className="signal-title">
                  <h3>{signal.coin_symbol.toUpperCase()}</h3>
                  <span
                    className="signal-type"
                    style={{ backgroundColor: getTypeColor(signal.signal_type) }}
                  >
                    {signal.signal_type}
                  </span>
                </div>
                <div className="signal-meta">
                  <span className="signal-date">{formatDate(signal.created_at)}</span>
                  {signal.strength && <span className="signal-strength">{signal.strength}</span>}
                </div>
              </div>

              <div className="signal-body">
                <div className="signal-price">
                  Price: <strong>${typeof signal.price === 'number' ? signal.price.toFixed(2) : 'N/A'}</strong>
                </div>

                <div className="signal-message">
                  {signal.message}
                </div>

                {signal.indicators && (
                  <div className="signal-indicators">
                    {signal.indicators.rsi && (
                      <div className="indicator">
                        <span>RSI:</span> {typeof signal.indicators.rsi === 'number' ? signal.indicators.rsi.toFixed(2) : 'N/A'}
                      </div>
                    )}
                    {signal.indicators.macd && (
                      <div className="indicator">
                        <span>MACD:</span> {typeof signal.indicators.macd.MACD === 'number' ? signal.indicators.macd.MACD.toFixed(4) : 'N/A'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </Layout>
  );
}
