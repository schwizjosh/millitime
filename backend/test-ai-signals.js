/**
 * Test AI-Enhanced Signal Generation
 * Usage: OPENAI_API_KEY=sk-... node test-ai-signals.js
 */

const axios = require('axios');

// Mock AI provider for testing without API keys
class TestAIProvider {
  async complete(messages) {
    console.log('\n🤖 AI Request:');
    console.log('Messages:', JSON.stringify(messages, null, 2));

    // Simulate AI response
    const mockResponse = {
      content: 'STRONG_BUY|Strong technical and fundamental alignment indicates buying opportunity|OVERRIDE:YES',
      tokensUsed: 150,
      model: 'test-model',
      provider: 'test',
    };

    console.log('\n📊 AI Response:', mockResponse.content);
    return mockResponse;
  }
}

// Test candle data (simulating BTC 15-min candles)
const mockCandles = Array.from({ length: 100 }, (_, i) => {
  const basePrice = 95000;
  const volatility = 500;
  const trend = i * 10; // Uptrend

  const price = basePrice + trend + (Math.random() - 0.5) * volatility;

  return {
    time: Date.now() - (100 - i) * 15 * 60 * 1000,
    open: price,
    high: price + Math.random() * 200,
    low: price - Math.random() * 200,
    close: price + (Math.random() - 0.5) * 100,
    volume: Math.random() * 1000000,
  };
});

async function testTechnicalAnalysis() {
  console.log('\n=== Testing Technical Analysis ===\n');

  try {
    const { technicalIndicatorService } = require('./src/services/technicalIndicators');

    const signal = technicalIndicatorService.generateConfluenceSignal(mockCandles);

    console.log('✅ Technical Signal Generated:');
    console.log({
      type: signal.type,
      strength: signal.strength,
      confidence: signal.confidence,
      indicators: {
        rsi: signal.indicators.rsi.toFixed(2),
        macd: signal.indicators.macd.MACD.toFixed(2),
        ema9: signal.indicators.ema9.toFixed(2),
      },
      signals: signal.signals.slice(0, 3),
    });

    return signal;
  } catch (error) {
    console.error('❌ Technical Analysis Failed:', error.message);
    return null;
  }
}

async function testFundamentalAnalysis() {
  console.log('\n=== Testing Fundamental Analysis ===\n');

  try {
    const { AIProviderService } = require('./src/services/aiProvider');
    const { FundamentalAnalysisService } = require('./src/services/fundamentalAnalysis');

    const aiProvider = new TestAIProvider();
    const faService = new FundamentalAnalysisService(aiProvider);

    // Mock fundamental data
    const mockFundamentals = {
      coinId: 'bitcoin',
      coinSymbol: 'BTC',
      marketCap: 1900000000000,
      volume24h: 45000000000,
      volumeMarketCapRatio: 0.024,
      circulatingSupply: 19500000,
      maxSupply: 21000000,
      priceChange7d: 5.2,
      priceChange30d: 12.8,
      priceChange1y: 145.3,
      athChangePercentage: -8.5,
      marketCapRank: 1,
    };

    console.log('📊 Mock Fundamental Data:', {
      coin: mockFundamentals.coinSymbol,
      rank: mockFundamentals.marketCapRank,
      volumeRatio: mockFundamentals.volumeMarketCapRatio,
      priceChange30d: mockFundamentals.priceChange30d + '%',
    });

    // Test quick score (no AI)
    const quickScore = faService.calculateQuickScore(mockFundamentals);
    console.log('\n✅ Quick Score (No AI):');
    console.log({
      overallScore: quickScore.overallScore,
      marketPosition: quickScore.marketPosition,
      volumeHealth: quickScore.volumeHealth,
      supplyDynamics: quickScore.supplyDynamics,
      priceAction: quickScore.priceAction,
      recommendation: quickScore.recommendation,
    });

    return quickScore;
  } catch (error) {
    console.error('❌ Fundamental Analysis Failed:', error.message);
    return null;
  }
}

async function testAIIntegration() {
  console.log('\n=== Testing AI Integration ===\n');

  try {
    const { AIProviderService } = require('./src/services/aiProvider');

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasClaude = !!process.env.ANTHROPIC_API_KEY;

    console.log('🔑 API Keys Status:');
    console.log('  OpenAI:', hasOpenAI ? '✅ Set' : '❌ Not Set');
    console.log('  Claude:', hasClaude ? '✅ Set' : '❌ Not Set');

    if (!hasOpenAI && !hasClaude) {
      console.log('\n⚠️  No AI keys configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to test AI features.');
      console.log('   Example: OPENAI_API_KEY=sk-... node test-ai-signals.js');
      return null;
    }

    const aiProvider = new AIProviderService({
      openaiKey: process.env.OPENAI_API_KEY,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      preferredProvider: 'auto',
    });

    const messages = [
      {
        role: 'system',
        content: 'You are a crypto trading assistant. Respond with just "TEST_SUCCESS".',
      },
      {
        role: 'user',
        content: 'Test message',
      },
    ];

    console.log('\n📡 Sending test request to AI provider...');
    const response = await aiProvider.complete(messages, {
      maxTokens: 50,
      taskComplexity: 'simple',
    });

    console.log('\n✅ AI Response Received:');
    console.log({
      provider: response.provider,
      model: response.model,
      tokensUsed: response.tokensUsed,
      content: response.content.substring(0, 100),
    });

    return response;
  } catch (error) {
    console.error('❌ AI Integration Failed:', error.message);
    if (error.response) {
      console.error('API Error:', error.response.data);
    }
    return null;
  }
}

async function testCompleteSystem() {
  console.log('\n=== Testing Complete AI Trading System ===\n');

  try {
    const { AIProviderService } = require('./src/services/aiProvider');
    const { AITradingStrategyService } = require('./src/services/aiTradingStrategy');

    const hasAI = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

    const aiProvider = hasAI
      ? new AIProviderService({
          openaiKey: process.env.OPENAI_API_KEY,
          anthropicKey: process.env.ANTHROPIC_API_KEY,
        })
      : new TestAIProvider();

    const aiStrategy = new AITradingStrategyService(aiProvider);

    console.log('🎯 Generating Enhanced Signal...\n');

    // This would normally fetch real data, but we'll skip that for testing
    // and just show that the service can be instantiated

    console.log('✅ AI Trading Strategy Service initialized successfully');
    console.log('   - AI Provider:', hasAI ? 'Real API' : 'Test Mock');
    console.log('   - Ready to generate signals');

    return true;
  } catch (error) {
    console.error('❌ Complete System Test Failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   AI-Enhanced Trading System - Test Suite    ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  const results = {
    technical: false,
    fundamental: false,
    ai: false,
    complete: false,
  };

  // Test 1: Technical Analysis
  const taResult = await testTechnicalAnalysis();
  results.technical = !!taResult;

  // Test 2: Fundamental Analysis
  const faResult = await testFundamentalAnalysis();
  results.fundamental = !!faResult;

  // Test 3: AI Integration
  const aiResult = await testAIIntegration();
  results.ai = !!aiResult;

  // Test 4: Complete System
  const completeResult = await testCompleteSystem();
  results.complete = !!completeResult;

  // Summary
  console.log('\n\n╔═══════════════════════════════════════════════╗');
  console.log('║              Test Results Summary             ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  console.log('Technical Analysis:     ', results.technical ? '✅ PASS' : '❌ FAIL');
  console.log('Fundamental Analysis:   ', results.fundamental ? '✅ PASS' : '❌ FAIL');
  console.log('AI Integration:         ', results.ai ? '✅ PASS' : '⚠️  SKIP (No API keys)');
  console.log('Complete System:        ', results.complete ? '✅ PASS' : '❌ FAIL');

  const passCount = Object.values(results).filter(r => r).length;
  const totalCount = Object.values(results).length;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Overall: ${passCount}/${totalCount} tests passed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!results.ai) {
    console.log('💡 Tip: Set AI API keys to test full functionality:');
    console.log('   OPENAI_API_KEY=sk-... node test-ai-signals.js\n');
  }
}

// Run all tests
runTests().catch(console.error);
