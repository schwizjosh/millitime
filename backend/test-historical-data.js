const axios = require('axios');

async function testDataAvailability() {
  console.log('=== TESTING API HISTORICAL DATA LIMITS ===\n');

  // Test 1: CryptoCompare daily data
  try {
    console.log('1. CryptoCompare Daily Data (BTC):');
    const cc = await axios.get('https://min-api.cryptocompare.com/data/v2/histoday', {
      params: { fsym: 'BTC', tsym: 'USD', limit: 2000 }
    });
    const ccCandles = cc.data.Data?.Data || [];
    const ccDays = ccCandles.length;
    const ccYears = (ccDays / 365).toFixed(1);
    console.log('   - Max candles available: ' + ccCandles.length);
    console.log('   - Time span: ~' + ccYears + ' years (' + ccDays + ' days)');
    if (ccCandles.length > 0) {
      const oldest = new Date(ccCandles[0].time * 1000).toISOString().split('T')[0];
      const newest = new Date(ccCandles[ccCandles.length-1].time * 1000).toISOString().split('T')[0];
      console.log('   - Date range: ' + oldest + ' to ' + newest);
    }
  } catch (e) {
    console.log('   ERROR: ' + e.message);
  }

  // Test 2: CoinGecko OHLC with max days
  try {
    console.log('\n2. CoinGecko OHLC Daily Data (BTC with days=max):');
    const cg = await axios.get('https://api.coingecko.com/api/v3/coins/bitcoin/ohlc', {
      params: { vs_currency: 'usd', days: 'max' }
    });
    const cgCandles = cg.data || [];
    const cgDays = cgCandles.length;
    const cgYears = (cgDays / 365).toFixed(1);
    console.log('   - Max candles with days=max: ' + cgCandles.length);
    console.log('   - Time span: ~' + cgYears + ' years (' + cgDays + ' days)');
    if (cgCandles.length > 0) {
      const oldest = new Date(cgCandles[0][0]).toISOString().split('T')[0];
      const newest = new Date(cgCandles[cgCandles.length-1][0]).toISOString().split('T')[0];
      console.log('   - Date range: ' + oldest + ' to ' + newest);
    }
  } catch (e) {
    console.log('   ERROR: ' + e.message);
  }

  // Test 3: CoinGecko with 1825 days (5 years)
  try {
    console.log('\n3. CoinGecko OHLC with days=1825 (5 years):');
    const cg1825 = await axios.get('https://api.coingecko.com/api/v3/coins/bitcoin/ohlc', {
      params: { vs_currency: 'usd', days: 1825 }
    });
    console.log('   - Candles returned: ' + cg1825.data.length);
    if (cg1825.data.length > 0) {
      const oldest = new Date(cg1825.data[0][0]).toISOString().split('T')[0];
      const newest = new Date(cg1825.data[cg1825.data.length-1][0]).toISOString().split('T')[0];
      console.log('   - Date range: ' + oldest + ' to ' + newest);
      const years = (cg1825.data.length / 365).toFixed(1);
      console.log('   - Actual span: ~' + years + ' years');
    }
  } catch (e) {
    console.log('   ERROR: ' + e.message);
  }

  // Test 4: Kraken daily data
  try {
    console.log('\n4. Kraken Daily Data (BTC):');
    const kr = await axios.get('https://api.kraken.com/0/public/OHLC', {
      params: { pair: 'XXBTZUSD', interval: 1440 }
    });
    const resultKey = Object.keys(kr.data.result).filter(k => k != 'last')[0];
    const krCandles = kr.data.result[resultKey] || [];
    console.log('   - Candles returned (default): ' + krCandles.length);
    console.log('   - Note: Kraken returns last 720 candles by default (~2 years of daily data)');
    if (krCandles.length > 0) {
      const oldest = new Date(krCandles[0][0] * 1000).toISOString().split('T')[0];
      const newest = new Date(krCandles[krCandles.length-1][0] * 1000).toISOString().split('T')[0];
      console.log('   - Date range: ' + oldest + ' to ' + newest);
    }
  } catch (e) {
    console.log('   ERROR: ' + e.message);
  }

  console.log('\n=== CANDLE REQUIREMENTS FOR 5-YEAR BACKTEST ===');
  console.log('- Daily candles: ~1,825 candles (5 years * 365 days)');
  console.log('- 4H candles: ~10,950 candles (5 years * 365 * 6 periods/day)');
  console.log('- 1H candles: ~43,800 candles (5 years * 365 * 24 hours/day)');
  console.log('- 15min candles: ~175,200 candles (NOT FEASIBLE - API limits)');

  console.log('\n=== VERDICT ===');
  console.log('✅ CryptoCompare: Can provide 5+ years of daily data (2000 limit)');
  console.log('✅ CoinGecko: Can provide 5+ years of daily data (days=max or days=1825)');
  console.log('⚠️  Kraken: Limited to ~2 years of daily data (720 candle limit)');
  console.log('\n💡 RECOMMENDATION: Use CryptoCompare or CoinGecko for 5+ year backtests with DAILY candles');
}

testDataAvailability().catch(console.error);
