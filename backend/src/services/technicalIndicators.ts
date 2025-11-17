import { RSI, MACD, BollingerBands, EMA, SMA } from 'technicalindicators';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicatorValues {
  rsi: number;
  macd: {
    MACD: number;
    signal: number;
    histogram: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  ema9: number;
  ema21: number;
  ema50: number;
  sma20: number;
}

export interface SignalResult {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidence: number; // 0-100 confluence score
  indicators: TechnicalIndicatorValues;
  signals: string[];
  message: string;
}

export class TechnicalIndicatorService {
  /**
   * Calculate RSI for crypto (14 period, optimized for 15min)
   * Uses 65/35 levels instead of traditional 70/30 for crypto volatility
   */
  calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    const rsiValues = RSI.calculate({
      values: prices,
      period: period,
    });

    return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
  }

  /**
   * Calculate MACD optimized for 15-minute crypto trading
   * Fast: 3, Slow: 10, Signal: 9 (faster than traditional 12/26/9)
   */
  calculateMACD(prices: number[]): { MACD: number; signal: number; histogram: number } | null {
    if (prices.length < 26) return null;

    const macdValues = MACD.calculate({
      values: prices,
      fastPeriod: 3,
      slowPeriod: 10,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const lastMACD = macdValues[macdValues.length - 1];
    if (!lastMACD) return null;

    return {
      MACD: lastMACD.MACD || 0,
      signal: lastMACD.signal || 0,
      histogram: lastMACD.histogram || 0,
    };
  }

  /**
   * Calculate Bollinger Bands (20 period, 2 std dev)
   */
  calculateBollingerBands(
    prices: number[],
    period: number = 20,
    stdDev: number = 2
  ): { upper: number; middle: number; lower: number } | null {
    if (prices.length < period) return null;

    const bbValues = BollingerBands.calculate({
      period: period,
      values: prices,
      stdDev: stdDev,
    });

    const lastBB = bbValues[bbValues.length - 1];
    if (!lastBB) return null;

    return {
      upper: lastBB.upper,
      middle: lastBB.middle,
      lower: lastBB.lower,
    };
  }

  /**
   * Calculate Exponential Moving Averages (9, 21, 50)
   */
  calculateEMAs(prices: number[]): { ema9: number | null; ema21: number | null; ema50: number | null } {
    const ema9Values = prices.length >= 9 ? EMA.calculate({ period: 9, values: prices }) : [];
    const ema21Values = prices.length >= 21 ? EMA.calculate({ period: 21, values: prices }) : [];
    const ema50Values = prices.length >= 50 ? EMA.calculate({ period: 50, values: prices }) : [];

    return {
      ema9: ema9Values.length > 0 ? ema9Values[ema9Values.length - 1] : null,
      ema21: ema21Values.length > 0 ? ema21Values[ema21Values.length - 1] : null,
      ema50: ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : null,
    };
  }

  /**
   * Calculate Simple Moving Average (used for Bollinger Bands middle line)
   */
  calculateSMA(prices: number[], period: number = 20): number | null {
    if (prices.length < period) return null;

    const smaValues = SMA.calculate({ period: period, values: prices });
    return smaValues.length > 0 ? smaValues[smaValues.length - 1] : null;
  }

  /**
   * Calculate all technical indicators for a dataset
   */
  calculateAllIndicators(candles: CandleData[]): TechnicalIndicatorValues | null {
    if (candles.length < 50) {
      console.log('Not enough candle data for full analysis');
      return null;
    }

    const closePrices = candles.map(c => c.close);
    const currentPrice = closePrices[closePrices.length - 1];

    const rsi = this.calculateRSI(closePrices);
    const macd = this.calculateMACD(closePrices);
    const bb = this.calculateBollingerBands(closePrices);
    const emas = this.calculateEMAs(closePrices);
    const sma20 = this.calculateSMA(closePrices);

    if (!rsi || !macd || !bb || !emas.ema9 || !emas.ema21 || !sma20) {
      return null;
    }

    return {
      rsi,
      macd,
      bollingerBands: bb,
      ema9: emas.ema9,
      ema21: emas.ema21,
      ema50: emas.ema50 || emas.ema21, // Fallback to EMA21 if not enough data
      sma20,
    };
  }

  /**
   * Multi-Strategy Confluence Signal Generator
   * Combines RSI, MACD, Bollinger Bands, and EMA for high-probability signals
   */
  generateConfluenceSignal(candles: CandleData[]): SignalResult | null {
    const indicators = this.calculateAllIndicators(candles);
    if (!indicators) return null;

    const currentPrice = candles[candles.length - 1].close;
    const previousPrice = candles[candles.length - 2]?.close || currentPrice;

    const signals: string[] = [];
    let buyScore = 0;
    let sellScore = 0;

    // Strategy 1: RSI Analysis (Crypto optimized: 65/35 instead of 70/30)
    if (indicators.rsi < 35) {
      buyScore += 25;
      signals.push(`RSI oversold (${indicators.rsi.toFixed(2)})`);
    } else if (indicators.rsi < 40) {
      buyScore += 15;
      signals.push(`RSI approaching oversold (${indicators.rsi.toFixed(2)})`);
    } else if (indicators.rsi > 65) {
      sellScore += 25;
      signals.push(`RSI overbought (${indicators.rsi.toFixed(2)})`);
    } else if (indicators.rsi > 60) {
      sellScore += 15;
      signals.push(`RSI approaching overbought (${indicators.rsi.toFixed(2)})`);
    }

    // Strategy 2: MACD Crossover (Fast settings: 3/10/9)
    if (indicators.macd.MACD > indicators.macd.signal && indicators.macd.histogram > 0) {
      buyScore += 25;
      signals.push('MACD bullish crossover');
    } else if (indicators.macd.MACD < indicators.macd.signal && indicators.macd.histogram < 0) {
      sellScore += 25;
      signals.push('MACD bearish crossover');
    }

    // Strategy 3: Bollinger Bands
    const bbPosition = (currentPrice - indicators.bollingerBands.lower) /
                       (indicators.bollingerBands.upper - indicators.bollingerBands.lower);

    if (currentPrice <= indicators.bollingerBands.lower) {
      buyScore += 30;
      signals.push('Price at/below lower Bollinger Band');
    } else if (bbPosition < 0.3) {
      buyScore += 20;
      signals.push('Price near lower Bollinger Band');
    } else if (currentPrice >= indicators.bollingerBands.upper) {
      sellScore += 30;
      signals.push('Price at/above upper Bollinger Band');
    } else if (bbPosition > 0.7) {
      sellScore += 20;
      signals.push('Price near upper Bollinger Band');
    }

    // Strategy 4: EMA Trend Confirmation
    const emaAligned = indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50;
    const emaBearish = indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50;

    if (currentPrice > indicators.ema9 && emaAligned) {
      buyScore += 20;
      signals.push('Bullish EMA alignment (9>21>50)');
    } else if (currentPrice < indicators.ema9 && emaBearish) {
      sellScore += 20;
      signals.push('Bearish EMA alignment (9<21<50)');
    }

    // Price crossing EMA9
    if (currentPrice > indicators.ema9 && previousPrice <= indicators.ema9) {
      buyScore += 15;
      signals.push('Price crossed above EMA9');
    } else if (currentPrice < indicators.ema9 && previousPrice >= indicators.ema9) {
      sellScore += 15;
      signals.push('Price crossed below EMA9');
    }

    // Determine signal type and strength based on confluence score
    let signalType: 'BUY' | 'SELL' | 'HOLD';
    let strength: 'STRONG' | 'MODERATE' | 'WEAK';
    let confidence: number;
    let message: string;

    if (buyScore > sellScore && buyScore >= 60) {
      signalType = 'BUY';
      strength = buyScore >= 80 ? 'STRONG' : buyScore >= 70 ? 'MODERATE' : 'WEAK';
      confidence = buyScore;
      message = `${strength} BUY signal with ${buyScore}% confluence: ${signals.join(', ')}`;
    } else if (sellScore > buyScore && sellScore >= 60) {
      signalType = 'SELL';
      strength = sellScore >= 80 ? 'STRONG' : sellScore >= 70 ? 'MODERATE' : 'WEAK';
      confidence = sellScore;
      message = `${strength} SELL signal with ${sellScore}% confluence: ${signals.join(', ')}`;
    } else if (buyScore > sellScore && buyScore >= 45) {
      signalType = 'BUY';
      strength = 'WEAK';
      confidence = buyScore;
      message = `WEAK BUY signal with ${buyScore}% confluence: ${signals.join(', ')}`;
    } else if (sellScore > buyScore && sellScore >= 45) {
      signalType = 'SELL';
      strength = 'WEAK';
      confidence = sellScore;
      message = `WEAK SELL signal with ${sellScore}% confluence: ${signals.join(', ')}`;
    } else {
      signalType = 'HOLD';
      strength = 'MODERATE';
      confidence = Math.max(buyScore, sellScore);
      message = `HOLD - No strong confluence. Buy score: ${buyScore}%, Sell score: ${sellScore}%. ${signals.join(', ') || 'Neutral indicators'}`;
    }

    return {
      type: signalType,
      strength,
      confidence,
      indicators,
      signals,
      message,
    };
  }

  /**
   * Detect RSI Divergence (bullish/bearish)
   */
  detectRSIDivergence(
    candles: CandleData[],
    rsiValues: number[],
    lookbackPeriods: number = 20
  ): 'BULLISH' | 'BEARISH' | 'NONE' {
    if (candles.length < lookbackPeriods || rsiValues.length < lookbackPeriods) {
      return 'NONE';
    }

    const recentCandles = candles.slice(-lookbackPeriods);
    const recentRSI = rsiValues.slice(-lookbackPeriods);

    // Find price lows and RSI lows
    const priceLows: number[] = [];
    const rsiLows: number[] = [];

    for (let i = 1; i < recentCandles.length - 1; i++) {
      if (recentCandles[i].low < recentCandles[i - 1].low &&
          recentCandles[i].low < recentCandles[i + 1].low) {
        priceLows.push(recentCandles[i].low);
        rsiLows.push(recentRSI[i]);
      }
    }

    // Bullish divergence: Price making lower lows, RSI making higher lows
    if (priceLows.length >= 2) {
      const priceDowntrend = priceLows[priceLows.length - 1] < priceLows[priceLows.length - 2];
      const rsiUptrend = rsiLows[rsiLows.length - 1] > rsiLows[rsiLows.length - 2];

      if (priceDowntrend && rsiUptrend) {
        return 'BULLISH';
      }
    }

    // Find price highs and RSI highs
    const priceHighs: number[] = [];
    const rsiHighs: number[] = [];

    for (let i = 1; i < recentCandles.length - 1; i++) {
      if (recentCandles[i].high > recentCandles[i - 1].high &&
          recentCandles[i].high > recentCandles[i + 1].high) {
        priceHighs.push(recentCandles[i].high);
        rsiHighs.push(recentRSI[i]);
      }
    }

    // Bearish divergence: Price making higher highs, RSI making lower highs
    if (priceHighs.length >= 2) {
      const priceUptrend = priceHighs[priceHighs.length - 1] > priceHighs[priceHighs.length - 2];
      const rsiDowntrend = rsiHighs[rsiHighs.length - 1] < rsiHighs[rsiHighs.length - 2];

      if (priceUptrend && rsiDowntrend) {
        return 'BEARISH';
      }
    }

    return 'NONE';
  }
}

export const technicalIndicatorService = new TechnicalIndicatorService();
