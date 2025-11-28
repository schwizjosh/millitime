import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { signalsAPI, type Signal } from '../services/api';
import { useRealTimeSignals } from '../hooks/useRealTimeSignals';
import '../styles/SignalsHistory.css';

export default function SignalsHistory() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');
  // Force timezone to UTC+2 (WAT+1) - Africa/Cairo
  const [timezone] = useState(() => localStorage.getItem('timezone') || 'Africa/Cairo');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Real-time signal stream
  const { connected: streamConnected } = useRealTimeSignals({
    autoConnect: true,
    onSignal: (signal) => {
      console.log('📡 New signal received in history:', signal);
      // Prepend new signal to the list
      setSignals(prev => [signal, ...prev]);
      setLastRefresh(new Date());
    }
  });

  useEffect(() => {
    fetchSignals();
    // Note: No more polling! Real-time signals are delivered via SSE
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
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
          </div>
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
                  Price: <strong>${signal.price ? Number(signal.price).toFixed(Number(signal.price) < 1 ? 6 : 2) : 'N/A'}</strong>
                </div>

                {/* Futures Trading Parameters */}
                {signal.position && signal.leverage && (
                  <div className="futures-params">
                    <div className="futures-header">
                      <span className="futures-label">Futures Trading</span>
                      <span className="position-badge" style={{
                        backgroundColor: signal.position === 'LONG' ? '#10b981' : '#ef4444'
                      }}>
                        {signal.position} {signal.leverage}x
                      </span>
                    </div>
                    <div className="futures-details">
                      <div className="futures-item">
                        <span>Entry:</span>
                        <strong>${signal.entry_price ? Number(signal.entry_price).toFixed(Number(signal.entry_price) < 1 ? 6 : 2) : 'N/A'}</strong>
                      </div>
                      <div className="futures-item">
                        <span>Stop Loss:</span>
                        <strong className="text-red">${signal.stop_loss ? Number(signal.stop_loss).toFixed(Number(signal.stop_loss) < 1 ? 6 : 2) : 'N/A'}</strong>
                      </div>
                      <div className="futures-item">
                        <span>Take Profit:</span>
                        <strong className="text-green">${signal.take_profit ? Number(signal.take_profit).toFixed(Number(signal.take_profit) < 1 ? 6 : 2) : 'N/A'}</strong>
                      </div>
                      {signal.risk_reward_ratio && (
                        <div className="futures-item">
                          <span>R:R Ratio:</span>
                          <strong>1:{Number(signal.risk_reward_ratio).toFixed(1)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="signal-message">
                  {signal.message}
                </div>

                {signal.indicators && (
                  <div className="signal-indicators">
                    {signal.indicators.rsi != null && (
                      <div className="indicator">
                        <span>RSI:</span> {Number(signal.indicators.rsi).toFixed(2)}
                      </div>
                    )}
                    {signal.indicators.macd?.MACD != null && (
                      <div className="indicator">
                        <span>MACD:</span> {Number(signal.indicators.macd.MACD).toFixed(4)}
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
