/**
 * Signal Generation Diagnostic Tool
 *
 * This script helps diagnose why signals might not be appearing:
 * 1. Checks if any signals exist in the database
 * 2. Verifies watchlist has active items
 * 3. Shows recent signal generation attempts
 * 4. Displays current confidence thresholds
 * 5. Tests signal generation for active coins
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/millitime';

async function diagn() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Database connected\n');

    // 1. Check total signals
    console.log('=== SIGNALS IN DATABASE ===');
    const signalsCount = await client.query('SELECT COUNT(*) as count FROM signals');
    console.log(`Total signals: ${signalsCount.rows[0].count}`);

    const recentSignals = await client.query(`
      SELECT signal_type, strength, coin_symbol, price, created_at,
             indicators->>'confluence' as confluence,
             indicators->>'overallScore' as overall_score
      FROM signals
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (recentSignals.rows.length > 0) {
      console.log('\nRecent 10 signals:');
      recentSignals.rows.forEach((s, i) => {
        const score = s.overall_score || s.confluence || 'N/A';
        console.log(`  ${i+1}. ${s.coin_symbol} ${s.signal_type} (${s.strength}) - Score: ${score}% - ${s.created_at}`);
      });
    } else {
      console.log('⚠️  NO SIGNALS FOUND - This is the problem!\n');
    }

    // 2. Check watchlist
    console.log('\n=== WATCHLIST STATUS ===');
    const watchlist = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_active = true) as active
      FROM watchlist
    `);
    console.log(`Total coins: ${watchlist.rows[0].total}`);
    console.log(`Active coins: ${watchlist.rows[0].active}`);

    if (parseInt(watchlist.rows[0].active) === 0) {
      console.log('⚠️  NO ACTIVE COINS IN WATCHLIST - Signals won\'t be generated!');
      console.log('   Solution: Add coins to your watchlist and ensure they\'re active\n');
    } else {
      const activeCoins = await client.query(`
        SELECT DISTINCT coin_id, coin_symbol, user_id
        FROM watchlist
        WHERE is_active = true
        LIMIT 10
      `);
      console.log('\nActive coins being monitored:');
      activeCoins.rows.forEach((c, i) => {
        console.log(`  ${i+1}. ${c.coin_symbol} (${c.coin_id})`);
      });
    }

    // 3. Check user settings
    console.log('\n=== USER TRADING SETTINGS ===');
    const users = await client.query(`
      SELECT u.id, u.username, ts.algo_enabled, ts.min_confidence_score
      FROM users u
      LEFT JOIN trading_settings ts ON ts.user_id = u.id
    `);

    if (users.rows.length > 0) {
      users.rows.forEach((u, i) => {
        const algoStatus = u.algo_enabled === false ? '❌ DISABLED' : '✅ ENABLED';
        const minConfidence = u.min_confidence_score || 'default (45%)';
        console.log(`  ${i+1}. ${u.username}: Algo ${algoStatus}, Min Confidence: ${minConfidence}`);
      });

      const disabledCount = users.rows.filter(u => u.algo_enabled === false).length;
      if (disabledCount > 0) {
        console.log(`\n⚠️  ${disabledCount} user(s) have algo trading DISABLED`);
      }
    }

    // 4. Show confidence thresholds
    console.log('\n=== CONFIDENCE THRESHOLDS ===');
    console.log('Current signal generation thresholds:');
    console.log('  • Minimum for BUY/SELL: 45%');
    console.log('  • Minimum for STRONG signals: 60%');
    console.log('  • Minimum for HOLD signals: 80% (rarely generated)');
    console.log('\nIf your coins have lower confluence scores, signals won\'t be generated.');

    // 5. Check price history to see if data is being collected
    console.log('\n=== PRICE DATA COLLECTION ===');
    const priceHistory = await client.query(`
      SELECT coin_id, COUNT(*) as datapoints, MAX(timestamp) as last_update
      FROM price_history
      GROUP BY coin_id
      ORDER BY last_update DESC
      LIMIT 5
    `);

    if (priceHistory.rows.length > 0) {
      console.log('Recent price data collection:');
      priceHistory.rows.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.coin_id}: ${p.datapoints} datapoints, last: ${p.last_update}`);
      });
    } else {
      console.log('⚠️  NO PRICE DATA - Backend may not be running!');
    }

    // 6. Summary
    console.log('\n=== DIAGNOSIS SUMMARY ===');
    const hasSignals = parseInt(signalsCount.rows[0].count) > 0;
    const hasActiveCoins = parseInt(watchlist.rows[0].active) > 0;
    const hasPriceData = priceHistory.rows.length > 0;

    if (!hasActiveCoins) {
      console.log('❌ Issue: No active coins in watchlist');
      console.log('   Fix: Add coins to your watchlist via the UI');
    } else if (!hasPriceData) {
      console.log('❌ Issue: Backend not collecting data');
      console.log('   Fix: Make sure backend server is running (npm run dev)');
    } else if (!hasSignals) {
      console.log('⚠️  Issue: Coins monitored but no signals generated');
      console.log('   Possible causes:');
      console.log('   1. Confidence scores below 45% threshold');
      console.log('   2. Not enough candlestick data (needs 50+ candles)');
      console.log('   3. Algo trading disabled in settings');
      console.log('   4. Signal generator hasn\'t run yet (runs every 15 minutes)');
    } else {
      console.log('✅ System appears to be working - signals are being generated');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Cannot connect to database. Make sure PostgreSQL is running.');
      console.log('   Try: docker-compose up postgres');
      console.log('   Or start your local PostgreSQL service');
    }
  } finally {
    await client.end();
  }
}

diagnose();
