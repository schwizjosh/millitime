/**
 * Rolling Window Backtest Runner
 * Tests trading strategy over 5+ years using 30-day windows with 1H candles
 *
 * Usage:
 *   node run-rolling-backtest.js [coin_symbol] [start_year] [window_days]
 *
 * Examples:
 *   node run-rolling-backtest.js BTC 2020 30      # BTC from 2020 with 30-day windows
 *   node run-rolling-backtest.js ETH 2019 30      # ETH from 2019 with 30-day windows
 *   node run-rolling-backtest.js SOL 2021 15      # SOL from 2021 with 15-day windows
 */

const axios = require('axios');

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:5001';
const DEFAULT_COIN = 'BTC';
const DEFAULT_START_YEAR = 2020;
const DEFAULT_WINDOW_DAYS = 30;
const INITIAL_BALANCE = 10000;

// Get command line arguments
const coinSymbol = process.argv[2] || DEFAULT_COIN;
const startYear = parseInt(process.argv[3]) || DEFAULT_START_YEAR;
const windowDays = parseInt(process.argv[4]) || DEFAULT_WINDOW_DAYS;

// Coin ID mapping
const COIN_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  UNI: 'uniswap',
  ATOM: 'cosmos',
};

async function runRollingBacktest() {
  const coinId = COIN_IDS[coinSymbol] || coinSymbol.toLowerCase();
  const startDate = `${startYear}-01-01`;
  const endDate = new Date().toISOString().split('T')[0];

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║      ROLLING WINDOW BACKTEST - Millitime Trading System      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Configuration:`);
  console.log(`   Coin: ${coinSymbol} (${coinId})`);
  console.log(`   Period: ${startDate} to ${endDate}`);
  console.log(`   Window size: ${windowDays} days`);
  console.log(`   Initial balance: $${INITIAL_BALANCE.toLocaleString()}`);
  console.log(`   Strategy: 1H timeframe with 30-min position updates`);
  console.log(`   AI: Disabled (technical analysis only for speed)\n`);

  const payload = {
    coin_id: coinId,
    coin_symbol: coinSymbol,
    start_date: startDate,
    end_date: endDate,
    initial_balance: INITIAL_BALANCE,
    risk_percentage: 1,
    use_ai: false, // Disable for speed
    use_futures: true,
    window_days: windowDays,
    window_step_days: windowDays, // No overlap
  };

  console.log('🚀 Starting backtest...\n');
  console.log('⏳ This may take 10-30 minutes depending on the period...\n');

  const startTime = Date.now();

  try {
    // For testing without auth, we'll need to bypass auth or use a test token
    // For now, let's try without auth (you may need to disable authMiddleware for testing)
    const response = await axios.post(
      `${API_BASE}/api/backtest/rolling-window`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          // Add auth token if needed: 'Authorization': 'Bearer YOUR_TOKEN'
        },
        timeout: 3600000, // 1 hour timeout
      }
    );

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n' + '═'.repeat(80));
    console.log('✅ ROLLING WINDOW BACKTEST COMPLETE');
    console.log('═'.repeat(80));

    const result = response.data.aggregated_result;
    const windows = response.data.windows_completed;

    console.log(`\n📈 Overall Results (${windows} windows completed in ${duration} minutes):`);
    console.log('─'.repeat(80));
    console.log(`   Period:              ${startDate} to ${endDate}`);
    console.log(`   Total Trades:        ${result.total_trades}`);
    console.log(`   Winning Trades:      ${result.winning_trades} (${result.win_rate.toFixed(2)}%)`);
    console.log(`   Losing Trades:       ${result.losing_trades}`);
    console.log(`   Initial Balance:     $${result.initial_balance.toLocaleString()}`);
    console.log(`   Final Balance:       $${result.final_balance.toLocaleString()}`);
    console.log(`   Total P&L:           $${result.total_profit_loss.toLocaleString()} (${result.profit_loss_percentage.toFixed(2)}%)`);
    console.log(`   Max Drawdown:        ${result.max_drawdown.toFixed(2)}%`);
    console.log(`   Sharpe Ratio:        ${result.sharpe_ratio.toFixed(2)}`);
    console.log(`   Average Win:         $${result.average_win.toFixed(2)}`);
    console.log(`   Average Loss:        $${result.average_loss.toFixed(2)}`);
    console.log(`   Largest Win:         $${result.largest_win.toFixed(2)}`);
    console.log(`   Largest Loss:        $${result.largest_loss.toFixed(2)}`);

    // Calculate ROI metrics
    const roi = result.profit_loss_percentage;
    const years = (new Date(endDate) - new Date(startDate)) / (365 * 24 * 60 * 60 * 1000);
    const annualizedReturn = (Math.pow(1 + roi / 100, 1 / years) - 1) * 100;

    console.log('\n📊 Performance Metrics:');
    console.log('─'.repeat(80));
    console.log(`   Total ROI:           ${roi.toFixed(2)}%`);
    console.log(`   Annualized Return:   ${annualizedReturn.toFixed(2)}%`);
    console.log(`   Risk/Reward Ratio:   ${(result.average_win / result.average_loss).toFixed(2)}:1`);
    console.log(`   Profit Factor:       ${((result.winning_trades * result.average_win) / (result.losing_trades * result.average_loss)).toFixed(2)}`);

    // Display window summary
    console.log('\n📅 Window Breakdown (first 10):');
    console.log('─'.repeat(80));
    const summary = response.data.window_summary.slice(0, 10);
    summary.forEach((w, i) => {
      const start = new Date(w.start_date).toISOString().split('T')[0];
      const end = new Date(w.end_date).toISOString().split('T')[0];
      const winRate = w.win_rate.toFixed(1);
      const pnl = w.profit_loss_percentage.toFixed(2);
      const balance = w.final_balance.toLocaleString();
      console.log(`   ${i + 1}. ${start} to ${end}: ${w.total_trades} trades, ${winRate}% win, ${pnl}% P&L, $${balance}`);
    });

    if (response.data.window_summary.length > 10) {
      console.log(`   ... and ${response.data.window_summary.length - 10} more windows`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`💾 Results saved to database (ID: ${response.data.backtest_id})`);
    console.log('═'.repeat(80) + '\n');

    // Interpretation
    console.log('🎯 Strategy Assessment:');
    if (result.win_rate >= 60) {
      console.log(`   ✅ Excellent win rate (${result.win_rate.toFixed(1)}%)`);
    } else if (result.win_rate >= 50) {
      console.log(`   ✓ Good win rate (${result.win_rate.toFixed(1)}%)`);
    } else {
      console.log(`   ⚠️  Below-average win rate (${result.win_rate.toFixed(1)}%)`);
    }

    if (roi > 0) {
      console.log(`   ✅ Profitable strategy (+${roi.toFixed(2)}%)`);
    } else {
      console.log(`   ❌ Unprofitable strategy (${roi.toFixed(2)}%)`);
    }

    if (result.sharpe_ratio > 1) {
      console.log(`   ✅ Good risk-adjusted returns (Sharpe: ${result.sharpe_ratio.toFixed(2)})`);
    } else {
      console.log(`   ⚠️  Low risk-adjusted returns (Sharpe: ${result.sharpe_ratio.toFixed(2)})`);
    }

    if (result.max_drawdown < 20) {
      console.log(`   ✅ Acceptable drawdown (${result.max_drawdown.toFixed(2)}%)`);
    } else if (result.max_drawdown < 40) {
      console.log(`   ⚠️  High drawdown (${result.max_drawdown.toFixed(2)}%)`);
    } else {
      console.log(`   ❌ Very high drawdown (${result.max_drawdown.toFixed(2)}%)`);
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Backtest failed:');

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data.error || JSON.stringify(error.response.data)}`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Cannot connect to API server. Is it running on ' + API_BASE + '?');
      console.error('   Run: cd /millitime/backend && npm run dev');
    } else {
      console.error(`   ${error.message}`);
    }

    process.exit(1);
  }
}

// ASCII art header
console.log('');
console.log('  ███╗   ███╗██╗██╗     ██╗     ██╗████████╗██╗███╗   ██╗███████╗');
console.log('  ████╗ ████║██║██║     ██║     ██║╚══██╔══╝██║████╗  ██║██╔════╝');
console.log('  ██╔████╔██║██║██║     ██║     ██║   ██║   ██║██╔██╗ ██║█████╗  ');
console.log('  ██║╚██╔╝██║██║██║     ██║     ██║   ██║   ██║██║╚██╗██║██╔══╝  ');
console.log('  ██║ ╚═╝ ██║██║███████╗███████╗██║   ██║   ██║██║ ╚████║███████╗');
console.log('  ╚═╝     ╚═╝╚═╝╚══════╝╚══════╝╚═╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝');
console.log('');

runRollingBacktest().catch(console.error);
