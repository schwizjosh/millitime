import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { positionsAPI, type TradingPosition } from '../services/api';
import '../styles/TradeHistory.css';

export default function TradeHistory() {
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'CLOSED' | 'ACTIVE'>('CLOSED');
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    position: TradingPosition | null;
  }>({ isOpen: false, position: null });
  const [feedbackForm, setFeedbackForm] = useState({
    user_feedback: 'NEUTRAL' as 'GOOD' | 'BAD' | 'NEUTRAL',
    user_rating: 3,
    user_notes: '',
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    fetchPositions();
  }, [filter]);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const statusFilter = filter === 'ALL' ? undefined : filter;
      const response = await positionsAPI.getPositions(100, 0, statusFilter);
      setPositions(response.data.positions || []);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const openFeedbackModal = (position: TradingPosition) => {
    setFeedbackModal({ isOpen: true, position });
    // Pre-fill if feedback exists
    if (position.user_feedback) {
      setFeedbackForm({
        user_feedback: position.user_feedback,
        user_rating: position.user_rating || 3,
        user_notes: position.user_notes || '',
      });
    } else {
      setFeedbackForm({
        user_feedback: 'NEUTRAL',
        user_rating: 3,
        user_notes: '',
      });
    }
  };

  const closeFeedbackModal = () => {
    setFeedbackModal({ isOpen: false, position: null });
    setFeedbackForm({ user_feedback: 'NEUTRAL', user_rating: 3, user_notes: '' });
  };

  const submitFeedback = async () => {
    if (!feedbackModal.position) return;

    try {
      setSubmittingFeedback(true);
      await positionsAPI.submitFeedback(feedbackModal.position.id, feedbackForm);

      // Refresh positions
      await fetchPositions();
      closeFeedbackModal();
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPnLColor = (pnl: number | null) => {
    if (pnl === null) return '#6b7280';
    return pnl > 0 ? '#10b981' : '#ef4444';
  };

  const getExitReasonBadge = (reason: string | null) => {
    if (!reason) return null;

    const badges: Record<string, { color: string; text: string }> = {
      TP_HIT: { color: '#10b981', text: 'TP Hit' },
      SL_HIT: { color: '#ef4444', text: 'SL Hit' },
      TIME_EXPIRED: { color: '#f59e0b', text: 'Time Expired' },
      REVERSAL: { color: '#8b5cf6', text: 'Reversal' },
      MANUAL: { color: '#6b7280', text: 'Manual Close' },
    };

    const badge = badges[reason] || { color: '#6b7280', text: reason };
    return <span className="exit-badge" style={{ backgroundColor: badge.color }}>{badge.text}</span>;
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading trade history...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="trade-history-container">
        <div className="trade-header">
          <div>
            <h1>Trade History</h1>
            <p className="hint">Review your past trades and provide feedback for ML training</p>
          </div>
          <div className="filter-buttons">
            {(['CLOSED', 'ACTIVE', 'ALL'] as const).map((filterType) => (
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

        <div className="positions-list">
          {positions.length === 0 ? (
            <div className="empty-state">
              <p>No positions found</p>
              <p className="hint">Closed positions will appear here</p>
            </div>
          ) : (
            positions.map((position) => (
              <div key={position.id} className="position-card">
                <div className="position-header">
                  <div className="position-title">
                    <h3>{position.coin_symbol.toUpperCase()}</h3>
                    <span
                      className="position-type"
                      style={{
                        backgroundColor: position.position_type === 'LONG' ? '#10b981' : '#ef4444'
                      }}
                    >
                      {position.position_type} {position.leverage}x
                    </span>
                    {getExitReasonBadge(position.exit_reason)}
                  </div>
                  <div className="position-meta">
                    <span className="position-date">{formatDate(position.opened_at)}</span>
                    <span className="position-status">{position.status}</span>
                  </div>
                </div>

                <div className="position-body">
                  <div className="position-prices">
                    <div className="price-item">
                      <span>Entry:</span>
                      <strong>${Number(position.entry_price).toFixed(6)}</strong>
                    </div>
                    {position.exit_price && (
                      <div className="price-item">
                        <span>Exit:</span>
                        <strong>${Number(position.exit_price).toFixed(6)}</strong>
                      </div>
                    )}
                    <div className="price-item">
                      <span>Stop Loss:</span>
                      <strong className="text-red">${Number(position.stop_loss).toFixed(6)}</strong>
                    </div>
                    <div className="price-item">
                      <span>Take Profit:</span>
                      <strong className="text-green">${Number(position.take_profit).toFixed(6)}</strong>
                    </div>
                  </div>

                  {position.pnl_percent !== null && (
                    <div className="position-pnl">
                      <div className="pnl-item">
                        <span>P/L:</span>
                        <strong style={{ color: getPnLColor(position.pnl_percent) }}>
                          {position.pnl_percent > 0 ? '+' : ''}{position.pnl_percent.toFixed(2)}%
                        </strong>
                      </div>
                      {position.pnl_usd !== null && (
                        <div className="pnl-item">
                          <span>USD:</span>
                          <strong style={{ color: getPnLColor(position.pnl_usd) }}>
                            ${position.pnl_usd > 0 ? '+' : ''}{position.pnl_usd.toFixed(2)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}

                  {position.user_feedback && (
                    <div className="feedback-display">
                      <span className={`feedback-badge ${position.user_feedback.toLowerCase()}`}>
                        {position.user_feedback}
                      </span>
                      {position.user_rating && (
                        <span className="rating-display">
                          {'⭐'.repeat(position.user_rating)}
                        </span>
                      )}
                      {position.user_notes && (
                        <p className="feedback-notes">{position.user_notes}</p>
                      )}
                    </div>
                  )}

                  {position.status === 'CLOSED' && (
                    <button
                      className="feedback-button"
                      onClick={() => openFeedbackModal(position)}
                    >
                      {position.user_feedback ? 'Update Feedback' : 'Add Feedback'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Feedback Modal */}
        {feedbackModal.isOpen && feedbackModal.position && (
          <div className="modal-overlay" onClick={closeFeedbackModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Trade Feedback</h2>
                <button className="modal-close" onClick={closeFeedbackModal}>×</button>
              </div>

              <div className="modal-body">
                <div className="feedback-section">
                  <label>How was this trade?</label>
                  <div className="feedback-options">
                    {(['GOOD', 'NEUTRAL', 'BAD'] as const).map((sentiment) => (
                      <button
                        key={sentiment}
                        className={`sentiment-button ${feedbackForm.user_feedback === sentiment ? 'active' : ''}`}
                        onClick={() => setFeedbackForm({ ...feedbackForm, user_feedback: sentiment })}
                      >
                        {sentiment === 'GOOD' && '👍 Good'}
                        {sentiment === 'NEUTRAL' && '😐 Neutral'}
                        {sentiment === 'BAD' && '👎 Bad'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="feedback-section">
                  <label>Rating: {feedbackForm.user_rating} stars</label>
                  <div className="rating-slider">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={feedbackForm.user_rating}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, user_rating: parseInt(e.target.value) })}
                    />
                    <div className="rating-display-large">
                      {'⭐'.repeat(feedbackForm.user_rating)}
                    </div>
                  </div>
                </div>

                <div className="feedback-section">
                  <label>Notes (optional)</label>
                  <textarea
                    className="feedback-textarea"
                    placeholder="What went well or what could be improved?"
                    value={feedbackForm.user_notes}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, user_notes: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="cancel-button" onClick={closeFeedbackModal}>
                  Cancel
                </button>
                <button
                  className="submit-button"
                  onClick={submitFeedback}
                  disabled={submittingFeedback}
                >
                  {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
