import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import '../styles/Trading.css';

interface Portfolio {
  id: number;
  coin_id: string;
  coin_symbol: string;
  coin_name: string;
  quantity: number;
  average_buy_price: number;
  total_invested: number;
  current_price?: number;
  current_value?: number;
  profit_loss?: number;
  profit_loss_percentage?: number;
}

interface PortfolioSummary {
  holdings: Portfolio[];
  totalInvested: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  availableBalance: number;
}

interface TradeHistory {
  id: number;
  trade_type: 'BUY' | 'SELL' | 'SWAP';
  from_coin_id?: string;
  from_coin_symbol?: string;
  from_quantity?: number;
  to_coin_id: string;
  to_coin_symbol: string;
  to_quantity: number;
  price: number;
  total_value: number;
  fee: number;
  created_at: string;
}

interface AIActionStep {
  step: number;
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  completed?: boolean;
}

interface AIActionSteps {
  id: number;
  coin_id: string;
  coin_symbol: string;
  action_plan: AIActionStep[];
  status: string;
  confidence: number;
  reasoning: string;
  cost_usd: number;
  created_at: string;
}

interface TokenUsageSummary {
  total_cost_usd: number;
  by_provider: {
    openai: number;
    anthropic: number;
  };
  by_operation: Record<string, number>;
  total_tokens: number;
}

interface CoinSearchResult {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
}

function Trading() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState<'swap' | 'bag' | 'history' | 'actions'>('swap');
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
  const [actionSteps, setActionSteps] = useState<AIActionSteps[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Swap form state
  const [swapType, setSwapType] = useState<'buy' | 'sell' | 'swap'>('buy');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CoinSearchResult[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<CoinSearchResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [processing, setProcessing] = useState(false);

  // Swap from coin (for swap type)
  const [fromCoin, setFromCoin] = useState<Portfolio | null>(null);

  // Error and success messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchPortfolio(),
        fetchTradeHistory(),
        fetchActionSteps(),
        fetchTokenUsage(),
      ]);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async () => {
    const response = await api.get('/api/portfolio/summary');
    setPortfolio(response.data);
  };

  const fetchTradeHistory = async () => {
    const response = await api.get('/api/portfolio/trades?limit=20');
    setTradeHistory(response.data);
  };

  const fetchActionSteps = async () => {
    const response = await api.get('/api/action-steps?status=ACTIVE');
    setActionSteps(response.data);
  };

  const fetchTokenUsage = async () => {
    const response = await api.get('/api/token-usage/summary?periodDays=30');
    setTokenUsage(response.data);
  };

  const searchCoins = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await api.get(`/api/coins/search?q=${encodeURIComponent(query)}`);
      setSearchResults(response.data.slice(0, 10));
    } catch (err) {
      console.error('Error searching coins:', err);
    }
  };

  const handleBuy = async () => {
    if (!selectedCoin || !quantity || parseFloat(quantity) <= 0) {
      setError('Please select a coin and enter a valid quantity');
      return;
    }

    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/api/portfolio/buy', {
        coinId: selectedCoin.id,
        coinSymbol: selectedCoin.symbol.toUpperCase(),
        coinName: selectedCoin.name,
        quantity: parseFloat(quantity),
        price: selectedCoin.current_price,
        fee: 0,
      });

      setSuccess(`Successfully bought ${quantity} ${selectedCoin.symbol.toUpperCase()}`);
      setQuantity('');
      setSelectedCoin(null);
      setSearchQuery('');
      await fetchPortfolio();
      await fetchTradeHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to execute buy order');
    } finally {
      setProcessing(false);
    }
  };

  const handleSell = async () => {
    if (!selectedCoin || !quantity || parseFloat(quantity) <= 0) {
      setError('Please select a coin and enter a valid quantity');
      return;
    }

    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/api/portfolio/sell', {
        coinId: selectedCoin.id,
        coinSymbol: selectedCoin.symbol.toUpperCase(),
        quantity: parseFloat(quantity),
        price: selectedCoin.current_price,
        fee: 0,
      });

      setSuccess(`Successfully sold ${quantity} ${selectedCoin.symbol.toUpperCase()}`);
      setQuantity('');
      setSelectedCoin(null);
      setSearchQuery('');
      await fetchPortfolio();
      await fetchTradeHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to execute sell order');
    } finally {
      setProcessing(false);
    }
  };

  const handleSwap = async () => {
    if (!fromCoin || !selectedCoin || !quantity || parseFloat(quantity) <= 0) {
      setError('Please select both coins and enter a valid quantity');
      return;
    }

    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/api/portfolio/swap', {
        fromCoinId: fromCoin.coin_id,
        fromCoinSymbol: fromCoin.coin_symbol,
        fromQuantity: parseFloat(quantity),
        toCoinId: selectedCoin.id,
        toCoinSymbol: selectedCoin.symbol.toUpperCase(),
        toCoinName: selectedCoin.name,
        fromPrice: fromCoin.current_price || 0,
        toPrice: selectedCoin.current_price,
        fee: 0,
      });

      setSuccess(`Successfully swapped ${quantity} ${fromCoin.coin_symbol} to ${selectedCoin.symbol.toUpperCase()}`);
      setQuantity('');
      setSelectedCoin(null);
      setFromCoin(null);
      setSearchQuery('');
      await fetchPortfolio();
      await fetchTradeHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to execute swap');
    } finally {
      setProcessing(false);
    }
  };

  const generateActionSteps = async (coinId: string, coinSymbol: string) => {
    setProcessing(true);
    try {
      await api.post('/api/action-steps/generate', {
        coinId,
        coinSymbol,
      });
      setSuccess('AI action steps generated successfully');
      await fetchActionSteps();
      await fetchTokenUsage();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate action steps');
    } finally {
      setProcessing(false);
    }
  };

  const markStepCompleted = async (actionId: number, stepNumber: number) => {
    try {
      await api.patch(`/api/action-steps/${actionId}/step/${stepNumber}`);
      await fetchActionSteps();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to mark step as completed');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="trading-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="trading-container">
      {/* Header */}
      <header className="trading-header">
        <div className="header-content">
          <h1>Millitime Trading</h1>
          <div className="header-actions">
            <button onClick={() => navigate('/dashboard')} className="btn-secondary">
              Dashboard
            </button>
            <button onClick={logout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>

        {/* Token Usage Counter */}
        {tokenUsage && (
          <div className="token-usage-banner">
            <div className="token-stat">
              <span className="label">Total AI Cost (30d):</span>
              <span className="value cost">{formatCurrency(tokenUsage.total_cost_usd)}</span>
            </div>
            <div className="token-stat">
              <span className="label">OpenAI:</span>
              <span className="value">{formatCurrency(tokenUsage.by_provider.openai)}</span>
            </div>
            <div className="token-stat">
              <span className="label">Anthropic:</span>
              <span className="value">{formatCurrency(tokenUsage.by_provider.anthropic)}</span>
            </div>
            <div className="token-stat">
              <span className="label">Total Tokens:</span>
              <span className="value">{tokenUsage.total_tokens.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Portfolio Summary */}
        {portfolio && (
          <div className="portfolio-summary">
            <div className="summary-stat">
              <span className="label">Available Balance:</span>
              <span className="value">{formatCurrency(portfolio.availableBalance)}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total Invested:</span>
              <span className="value">{formatCurrency(portfolio.totalInvested)}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Current Value:</span>
              <span className="value">{formatCurrency(portfolio.totalCurrentValue)}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Profit/Loss:</span>
              <span className={`value ${portfolio.totalProfitLoss >= 0 ? 'profit' : 'loss'}`}>
                {formatCurrency(portfolio.totalProfitLoss)} ({formatPercent(portfolio.totalProfitLossPercentage)})
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="trading-tabs">
        <button
          className={`tab ${activeTab === 'swap' ? 'active' : ''}`}
          onClick={() => setActiveTab('swap')}
        >
          Swap/Trade
        </button>
        <button
          className={`tab ${activeTab === 'bag' ? 'active' : ''}`}
          onClick={() => setActiveTab('bag')}
        >
          Bag ({portfolio?.holdings.length || 0})
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
        <button
          className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          AI Actions ({actionSteps.length})
        </button>
      </div>

      {/* Messages */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Tab Content */}
      <div className="trading-content">
        {/* Swap/Trade Tab */}
        {activeTab === 'swap' && (
          <div className="swap-container">
            <div className="swap-type-selector">
              <button
                className={`type-btn ${swapType === 'buy' ? 'active' : ''}`}
                onClick={() => setSwapType('buy')}
              >
                Buy
              </button>
              <button
                className={`type-btn ${swapType === 'sell' ? 'active' : ''}`}
                onClick={() => setSwapType('sell')}
              >
                Sell
              </button>
              <button
                className={`type-btn ${swapType === 'swap' ? 'active' : ''}`}
                onClick={() => setSwapType('swap')}
              >
                Swap
              </button>
            </div>

            <div className="swap-form">
              {swapType === 'swap' && (
                <div className="form-group">
                  <label>From Coin</label>
                  <select
                    value={fromCoin?.coin_id || ''}
                    onChange={(e) => {
                      const coin = portfolio?.holdings.find(h => h.coin_id === e.target.value);
                      setFromCoin(coin || null);
                    }}
                  >
                    <option value="">Select coin to swap from</option>
                    {portfolio?.holdings.map(holding => (
                      <option key={holding.coin_id} value={holding.coin_id}>
                        {holding.coin_symbol} - {holding.quantity} available
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>{swapType === 'swap' ? 'To Coin' : 'Coin'}</label>
                <input
                  type="text"
                  placeholder="Search for a coin..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchCoins(e.target.value);
                  }}
                />
                {searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map(coin => (
                      <div
                        key={coin.id}
                        className="search-result-item"
                        onClick={() => {
                          setSelectedCoin(coin);
                          setSearchQuery(`${coin.name} (${coin.symbol.toUpperCase()})`);
                          setSearchResults([]);
                        }}
                      >
                        <span className="coin-name">{coin.name}</span>
                        <span className="coin-symbol">{coin.symbol.toUpperCase()}</span>
                        <span className="coin-price">{formatCurrency(coin.current_price)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedCoin && (
                  <div className="selected-coin">
                    <span>{selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})</span>
                    <span>{formatCurrency(selectedCoin.current_price)}</span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  step="0.00000001"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {selectedCoin && quantity && (
                  <div className="trade-summary">
                    <span>Total: {formatCurrency(parseFloat(quantity) * selectedCoin.current_price)}</span>
                  </div>
                )}
              </div>

              <button
                className="btn-primary btn-trade"
                onClick={() => {
                  if (swapType === 'buy') handleBuy();
                  else if (swapType === 'sell') handleSell();
                  else if (swapType === 'swap') handleSwap();
                }}
                disabled={processing}
              >
                {processing ? 'Processing...' : `${swapType.toUpperCase()}`}
              </button>
            </div>
          </div>
        )}

        {/* Bag Tab */}
        {activeTab === 'bag' && portfolio && (
          <div className="bag-container">
            <h2>Your Bag</h2>
            {portfolio.holdings.length === 0 ? (
              <p className="empty-message">No holdings yet. Start trading to build your portfolio!</p>
            ) : (
              <div className="holdings-grid">
                {portfolio.holdings.map(holding => (
                  <div key={holding.coin_id} className="holding-card">
                    <div className="holding-header">
                      <h3>{holding.coin_symbol}</h3>
                      <span className="coin-name">{holding.coin_name}</span>
                    </div>
                    <div className="holding-stats">
                      <div className="stat">
                        <span className="label">Quantity:</span>
                        <span className="value">{holding.quantity.toFixed(8)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Avg Buy Price:</span>
                        <span className="value">{formatCurrency(holding.average_buy_price)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Current Price:</span>
                        <span className="value">{formatCurrency(holding.current_price || 0)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Total Invested:</span>
                        <span className="value">{formatCurrency(holding.total_invested)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Current Value:</span>
                        <span className="value">{formatCurrency(holding.current_value || 0)}</span>
                      </div>
                      <div className="stat">
                        <span className="label">P/L:</span>
                        <span className={`value ${(holding.profit_loss || 0) >= 0 ? 'profit' : 'loss'}`}>
                          {formatCurrency(holding.profit_loss || 0)} ({formatPercent(holding.profit_loss_percentage || 0)})
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-secondary btn-generate-actions"
                      onClick={() => generateActionSteps(holding.coin_id, holding.coin_symbol)}
                      disabled={processing}
                    >
                      Generate AI Actions
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="history-container">
            <h2>Trade History</h2>
            {tradeHistory.length === 0 ? (
              <p className="empty-message">No trade history yet.</p>
            ) : (
              <div className="history-list">
                {tradeHistory.map(trade => (
                  <div key={trade.id} className="history-item">
                    <div className={`trade-type ${trade.trade_type.toLowerCase()}`}>
                      {trade.trade_type}
                    </div>
                    <div className="trade-details">
                      {trade.trade_type === 'SWAP' ? (
                        <span className="trade-text">
                          {trade.from_quantity?.toFixed(8)} {trade.from_coin_symbol} → {trade.to_quantity.toFixed(8)} {trade.to_coin_symbol}
                        </span>
                      ) : trade.trade_type === 'BUY' ? (
                        <span className="trade-text">
                          {trade.to_quantity.toFixed(8)} {trade.to_coin_symbol} @ {formatCurrency(trade.price)}
                        </span>
                      ) : (
                        <span className="trade-text">
                          {trade.from_quantity?.toFixed(8)} {trade.from_coin_symbol} @ {formatCurrency(trade.price)}
                        </span>
                      )}
                      <span className="trade-value">{formatCurrency(trade.total_value)}</span>
                      <span className="trade-date">
                        {new Date(trade.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Actions Tab */}
        {activeTab === 'actions' && (
          <div className="actions-container">
            <h2>AI-Generated Action Steps</h2>
            {actionSteps.length === 0 ? (
              <p className="empty-message">No active action steps. Generate one from the Bag tab!</p>
            ) : (
              <div className="actions-list">
                {actionSteps.map(action => (
                  <div key={action.id} className="action-card">
                    <div className="action-header">
                      <h3>{action.coin_symbol}</h3>
                      <div className="action-meta">
                        <span className="confidence">Confidence: {action.confidence}%</span>
                        <span className="cost">Cost: {formatCurrency(action.cost_usd)}</span>
                      </div>
                    </div>
                    <p className="action-reasoning">{action.reasoning}</p>
                    <div className="action-steps">
                      {action.action_plan.map(step => (
                        <div
                          key={step.step}
                          className={`action-step priority-${step.priority.toLowerCase()} ${step.completed ? 'completed' : ''}`}
                        >
                          <div className="step-number">{step.step}</div>
                          <div className="step-content">
                            <div className="step-header">
                              <span className="step-action">{step.action}</span>
                              <span className={`step-priority priority-${step.priority.toLowerCase()}`}>
                                {step.priority}
                              </span>
                            </div>
                            <p className="step-reason">{step.reason}</p>
                          </div>
                          <button
                            className="btn-check"
                            onClick={() => markStepCompleted(action.id, step.step)}
                            disabled={step.completed}
                          >
                            {step.completed ? '✓' : '○'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="action-date">
                      Generated: {new Date(action.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Trading;
