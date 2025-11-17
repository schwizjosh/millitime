// Quick test script to manually trigger signal generation and see results
const { candleDataFetcher } = require('./dist/services/candleDataFetcher');
const { technicalIndicatorService } = require('./dist/services/technicalIndicators');

async function testSignalGeneration() {
  console.log('Testing 15-Minute Trading Strategy Signal Generation\n');
  console.log('='.repeat(60));

  // Test with Bitcoin
  const coins = [
    { id: 'bitcoin', symbol: 'BTC' },
    { id: 'ethereum', symbol: 'ETH' },
    { id: 'solana', symbol: 'SOL' }
  ];

  for (const coin of coins) {
    console.log(`\n\n📊 Analyzing ${coin.symbol}...`);
    console.log('-'.repeat(60));

    try {
      // Fetch 15-minute candlestick data from multiple sources
      const candles = await candleDataFetcher.fetch15MinCandles(coin.id, coin.symbol, 100);

      if (!candles || candles.length < 50) {
        console.log(`❌ Not enough data for ${coin.symbol}`);
        continue;
      }

      console.log(`✅ Fetched ${candles.length} 15-minute candles`);
      console.log(`   Latest price: $${candles[candles.length - 1].close.toFixed(2)}`);

      // Generate confluence signal
      const signal = technicalIndicatorService.generateConfluenceSignal(candles);

      if (!signal) {
        console.log(`ℹ️  No signal generated for ${coin.symbol}`);
        continue;
      }

      // Display results
      console.log(`\n🎯 SIGNAL: ${signal.type} (${signal.strength})`);
      console.log(`   Confluence Score: ${signal.confidence}%`);
      console.log(`\n📈 Technical Indicators:`);
      console.log(`   RSI: ${signal.indicators.rsi.toFixed(2)}`);
      console.log(`   MACD: ${signal.indicators.macd.MACD.toFixed(4)}`);
      console.log(`   MACD Signal: ${signal.indicators.macd.signal.toFixed(4)}`);
      console.log(`   MACD Histogram: ${signal.indicators.macd.histogram.toFixed(4)}`);
      console.log(`   Bollinger Upper: $${signal.indicators.bollingerBands.upper.toFixed(2)}`);
      console.log(`   Bollinger Middle: $${signal.indicators.bollingerBands.middle.toFixed(2)}`);
      console.log(`   Bollinger Lower: $${signal.indicators.bollingerBands.lower.toFixed(2)}`);
      console.log(`   EMA 9: $${signal.indicators.ema9.toFixed(2)}`);
      console.log(`   EMA 21: $${signal.indicators.ema21.toFixed(2)}`);
      console.log(`   EMA 50: $${signal.indicators.ema50.toFixed(2)}`);

      console.log(`\n💡 Signal Reasons:`);
      signal.signals.forEach(s => console.log(`   • ${s}`));

      console.log(`\n📝 Message: ${signal.message}`);

    } catch (error) {
      console.error(`❌ Error analyzing ${coin.symbol}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!');
}

testSignalGeneration().catch(console.error);
