import { RSI, MACD, BollingerBands, EMA, SMA, ATR, ADX } from 'technicalindicators';

/**
 * Adaptive RSI thresholds based on market volatility
 * Higher volatility = wider thresholds (more extreme readings needed)
 * Lower volatility = tighter thresholds (react to smaller moves)
 */
export interface AdaptiveRSIThresholds {
  oversold: number;        // Below this = oversold (buy signal)
  approachingOversold: number;
  overbought: number;      // Above this = overbought (sell signal)
  approachingOverbought: number;
  volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
}

/**
 * Volume analysis result with percentile ranking
 */
export interface VolumeAnalysis {
  currentVolume: number;
  averageVolume: number;
  percentileRank: number;  // 0-100, where 100 = highest volume in period
  isSpike: boolean;        // True if in top 20% (80th percentile)
  isDry: boolean;          // True if in bottom 20% (20th percentile)
  volumeTrend: number;     // % change from average
}

/**
 * ADX (Average Directional Index) for trend strength measurement
 */
export interface TrendStrength {
  adx: number;              // ADX value (0-100)
  plusDI: number;           // +DI (positive directional indicator)
  minusDI: number;          // -DI (negative directional indicator)
  trendStrength: 'NO_TREND' | 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  shouldTrade: boolean;     // False if ADX < 20 (no clear trend)
}

/**
 * Support and Resistance zones detected from price action
 */
export interface SupportResistanceZones {
  supports: { price: number; strength: number; touches: number }[];
  resistances: { price: number; strength: number; touches: number }[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  currentZone: 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MID_RANGE' | 'BREAKOUT';
  distanceToSupport: number;    // % distance
  distanceToResistance: number; // % distance
}

/**
 * ATR-based stop loss and take profit levels
 */
export interface RiskLevels {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;      // Secondary TP for scaling out
  takeProfit3?: number;      // Tertiary TP
  riskRewardRatio: number;
  atrMultiplierSL: number;   // ATR multiplier used for SL
  atrMultiplierTP: number;   // ATR multiplier used for TP
  positionRisk: number;      // % risk if SL hit
}

/**
 * Time-decayed signal with expiration
 */
export interface TimedSignal {
  originalConfidence: number;
  currentConfidence: number;
  createdAt: number;         // Unix timestamp
  expiresAt: number;         // Unix timestamp
  halfLifeMinutes: number;
  isExpired: boolean;
  minutesElapsed: number;
  decayFactor: number;       // 0-1, multiplier applied
}

/**
 * Multi-timeframe analysis result
 */
export interface MultiTimeframeAnalysis {
  primaryTimeframe: string;  // e.g., '15m'
  higherTimeframe: string;   // e.g., '1h'
  primaryTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  higherTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  alignment: 'ALIGNED' | 'CONFLICTING' | 'NEUTRAL';
  confidenceAdjustment: number; // +/- adjustment based on alignment
  recommendation: string;
}

/**
 * Dynamic position sizing based on volatility and confidence
 */
export interface PositionSizing {
  recommendedSize: number;      // 0-100% of available capital
  maxSize: number;              // Hard cap based on risk
  volatilityAdjustment: number; // Multiplier based on ATR
  confidenceAdjustment: number; // Multiplier based on signal strength
  riskPerTrade: number;         // % of capital at risk
  kellyFraction: number;        // Kelly criterion suggestion
  reasoning: string[];
}

/**
 * BTC correlation analysis for altcoin signals
 */
export interface BTCCorrelation {
  btcTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  btcMomentum: number;          // % change in lookback period
  correlationImpact: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  confidenceAdjustment: number; // +/- adjustment
  warning?: string;
}

/**
 * AI sentiment analysis result
 */
export interface AISentiment {
  score: number;                // -100 to +100
  sentiment: 'VERY_BEARISH' | 'BEARISH' | 'NEUTRAL' | 'BULLISH' | 'VERY_BULLISH';
  confidenceAdjustment: number;
  sources: string[];            // What data was analyzed
  summary: string;              // AI-generated summary
}

/**
 * Candlestick pattern recognition
 */
export interface CandlestickPattern {
  pattern: string;              // e.g., 'HAMMER', 'ENGULFING', 'DOJI'
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reliability: number;          // 0-100
  description: string;
}

/**
 * Weighted indicator scores for confluence
 */
export interface WeightedScore {
  indicator: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
  reliability: number;
}

/**
 * Enhanced signal result with all new features
 */
export interface EnhancedSignalResult {
  // Core signal
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidence: number;

  // Risk management
  riskLevels: RiskLevels;
  positionSizing: PositionSizing;

  // Filters and confirmations
  trendStrength: TrendStrength;
  supportResistance: SupportResistanceZones;
  multiTimeframe?: MultiTimeframeAnalysis;
  btcCorrelation?: BTCCorrelation;

  // Time management
  timedSignal: TimedSignal;

  // AI enhancements
  sentiment?: AISentiment;
  patterns: CandlestickPattern[];
  aiDescription: string;

  // Scoring breakdown
  weightedScores: WeightedScore[];
  totalWeightedScore: number;

  // Original data
  indicators: TechnicalIndicatorValues;
  signals: string[];
  message: string;
  hasConflict: boolean;
  conflictReason: string;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number; // Optional timestamp for compatibility
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
  volumeTrend?: number | null;
  priceMomentum?: number;
  rangePosition?: number;
  atr?: number; // Average True Range for volatility measurement
}

export interface SignalResult {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidence: number; // 0-100 confluence score
  indicators: TechnicalIndicatorValues;
  signals: string[];
  message: string;
  hasConflict?: boolean; // True if major indicators conflict (RSI vs MACD)
  conflictReason?: string; // Description of the conflict
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
   * Calculate Average True Range (ATR) for volatility measurement
   * ATR measures market volatility by decomposing the entire range of an asset price
   */
  calculateATR(candles: CandleData[], period: number = 14): number | null {
    if (candles.length < period + 1) return null;

    const atrInput = {
      high: candles.map(c => c.high),
      low: candles.map(c => c.low),
      close: candles.map(c => c.close),
      period: period,
    };

    const atrValues = ATR.calculate(atrInput);
    return atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
  }

  /**
   * Calculate ATR as percentage of price (normalized volatility)
   * This allows comparison across different price levels
   */
  calculateATRPercent(candles: CandleData[], period: number = 14): number | null {
    const atr = this.calculateATR(candles, period);
    if (!atr) return null;

    const currentPrice = candles[candles.length - 1].close;
    if (currentPrice <= 0) return null;

    return (atr / currentPrice) * 100;
  }

  /**
   * Calculate adaptive RSI thresholds based on ATR volatility
   *
   * Logic:
   * - LOW volatility (ATR% < 1.5%): Tighter thresholds (32/68) - react to smaller moves
   * - NORMAL volatility (ATR% 1.5-3%): Standard crypto thresholds (35/65)
   * - HIGH volatility (ATR% 3-5%): Wider thresholds (30/70) - need more extreme readings
   * - EXTREME volatility (ATR% > 5%): Very wide thresholds (25/75) - only react to extremes
   */
  calculateAdaptiveRSIThresholds(candles: CandleData[]): AdaptiveRSIThresholds {
    const atrPercent = this.calculateATRPercent(candles);

    // Default to NORMAL if ATR can't be calculated
    if (atrPercent === null) {
      return {
        oversold: 35,
        approachingOversold: 40,
        overbought: 65,
        approachingOverbought: 60,
        volatilityLevel: 'NORMAL',
      };
    }

    if (atrPercent < 1.5) {
      // LOW volatility - tighter thresholds
      return {
        oversold: 32,
        approachingOversold: 38,
        overbought: 68,
        approachingOverbought: 62,
        volatilityLevel: 'LOW',
      };
    } else if (atrPercent < 3) {
      // NORMAL volatility - standard crypto thresholds
      return {
        oversold: 35,
        approachingOversold: 40,
        overbought: 65,
        approachingOverbought: 60,
        volatilityLevel: 'NORMAL',
      };
    } else if (atrPercent < 5) {
      // HIGH volatility - wider thresholds
      return {
        oversold: 30,
        approachingOversold: 37,
        overbought: 70,
        approachingOverbought: 63,
        volatilityLevel: 'HIGH',
      };
    } else {
      // EXTREME volatility - very wide thresholds
      return {
        oversold: 25,
        approachingOversold: 33,
        overbought: 75,
        approachingOverbought: 67,
        volatilityLevel: 'EXTREME',
      };
    }
  }

  /**
   * Calculate volume analysis with percentile ranking
   * Uses percentile-based detection instead of arbitrary % thresholds
   *
   * @param volumes - Array of volume values
   * @param lookbackPeriod - Number of periods to analyze (default 40)
   * @returns VolumeAnalysis with percentile-based spike/dry detection
   */
  analyzeVolume(volumes: number[], lookbackPeriod: number = 40): VolumeAnalysis {
    if (volumes.length === 0) {
      return {
        currentVolume: 0,
        averageVolume: 0,
        percentileRank: 50,
        isSpike: false,
        isDry: false,
        volumeTrend: 0,
      };
    }

    const recentVolumes = volumes.slice(-lookbackPeriod);
    const currentVolume = recentVolumes[recentVolumes.length - 1] || 0;
    const averageVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;

    // Calculate percentile rank of current volume
    // Sort volumes and find position of current volume
    const sortedVolumes = [...recentVolumes].sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sortedVolumes.length; i++) {
      if (sortedVolumes[i] <= currentVolume) {
        rank = i + 1;
      }
    }
    const percentileRank = (rank / sortedVolumes.length) * 100;

    // Volume spike = top 20% (80th percentile or higher)
    const isSpike = percentileRank >= 80;

    // Dry volume = bottom 20% (20th percentile or lower)
    const isDry = percentileRank <= 20;

    // Volume trend as % change from average
    const volumeTrend = averageVolume > 0 ? ((currentVolume - averageVolume) / averageVolume) * 100 : 0;

    return {
      currentVolume,
      averageVolume,
      percentileRank,
      isSpike,
      isDry,
      volumeTrend,
    };
  }

  // ============================================================
  // NEW FEATURES: ADX, Risk Levels, Time Decay, etc.
  // ============================================================

  /**
   * Calculate ADX (Average Directional Index) for trend strength
   * ADX measures trend strength regardless of direction
   *
   * Interpretation:
   * - ADX < 20: No trend / weak trend (avoid trading)
   * - ADX 20-25: Trend emerging
   * - ADX 25-50: Strong trend (good for trading)
   * - ADX 50-75: Very strong trend
   * - ADX > 75: Extremely strong (potential exhaustion)
   */
  calculateTrendStrength(candles: CandleData[], period: number = 14): TrendStrength {
    if (candles.length < period + 1) {
      return {
        adx: 0,
        plusDI: 0,
        minusDI: 0,
        trendStrength: 'NO_TREND',
        trendDirection: 'NEUTRAL',
        shouldTrade: false,
      };
    }

    const adxInput = {
      high: candles.map(c => c.high),
      low: candles.map(c => c.low),
      close: candles.map(c => c.close),
      period: period,
    };

    const adxValues = ADX.calculate(adxInput);
    const lastADX = adxValues[adxValues.length - 1];

    if (!lastADX) {
      return {
        adx: 0,
        plusDI: 0,
        minusDI: 0,
        trendStrength: 'NO_TREND',
        trendDirection: 'NEUTRAL',
        shouldTrade: false,
      };
    }

    const adx = lastADX.adx;
    const plusDI = lastADX.pdi;
    const minusDI = lastADX.mdi;

    // Determine trend strength category
    let trendStrength: TrendStrength['trendStrength'];
    if (adx < 20) {
      trendStrength = 'NO_TREND';
    } else if (adx < 25) {
      trendStrength = 'WEAK';
    } else if (adx < 50) {
      trendStrength = 'MODERATE';
    } else if (adx < 75) {
      trendStrength = 'STRONG';
    } else {
      trendStrength = 'VERY_STRONG';
    }

    // Determine trend direction from DI lines
    let trendDirection: TrendStrength['trendDirection'];
    if (plusDI > minusDI + 5) {
      trendDirection = 'BULLISH';
    } else if (minusDI > plusDI + 5) {
      trendDirection = 'BEARISH';
    } else {
      trendDirection = 'NEUTRAL';
    }

    // Only trade when there's a clear trend
    const shouldTrade = adx >= 20;

    return {
      adx,
      plusDI,
      minusDI,
      trendStrength,
      trendDirection,
      shouldTrade,
    };
  }

  /**
   * Calculate ATR-based stop loss and take profit levels
   * Adapts to market volatility automatically
   *
   * @param candles - Price data
   * @param entryPrice - Entry price for the position
   * @param isLong - True for long, false for short
   * @param atrMultiplierSL - ATR multiplier for stop loss (default 1.5)
   * @param atrMultiplierTP - ATR multiplier for take profit (default 2.5)
   */
  calculateRiskLevels(
    candles: CandleData[],
    entryPrice: number,
    isLong: boolean,
    atrMultiplierSL: number = 1.5,
    atrMultiplierTP: number = 2.5
  ): RiskLevels {
    const atr = this.calculateATR(candles) || entryPrice * 0.02; // Fallback to 2%

    let stopLoss: number;
    let takeProfit: number;
    let takeProfit2: number;
    let takeProfit3: number;

    if (isLong) {
      stopLoss = entryPrice - (atr * atrMultiplierSL);
      takeProfit = entryPrice + (atr * atrMultiplierTP);
      takeProfit2 = entryPrice + (atr * atrMultiplierTP * 1.5);
      takeProfit3 = entryPrice + (atr * atrMultiplierTP * 2);
    } else {
      stopLoss = entryPrice + (atr * atrMultiplierSL);
      takeProfit = entryPrice - (atr * atrMultiplierTP);
      takeProfit2 = entryPrice - (atr * atrMultiplierTP * 1.5);
      takeProfit3 = entryPrice - (atr * atrMultiplierTP * 2);
    }

    const riskAmount = Math.abs(entryPrice - stopLoss);
    const rewardAmount = Math.abs(takeProfit - entryPrice);
    const riskRewardRatio = rewardAmount / riskAmount;
    const positionRisk = (riskAmount / entryPrice) * 100;

    return {
      entryPrice,
      stopLoss,
      takeProfit,
      takeProfit2,
      takeProfit3,
      riskRewardRatio,
      atrMultiplierSL,
      atrMultiplierTP,
      positionRisk,
    };
  }

  /**
   * Calculate time-decayed signal confidence
   * Signals lose validity over time using exponential decay
   *
   * Formula: current = original × e^(-elapsed / halfLife)
   *
   * @param originalConfidence - Original signal confidence (0-100)
   * @param createdAt - Unix timestamp when signal was created
   * @param halfLifeMinutes - Time for confidence to halve (default 30 min)
   * @param maxLifeMinutes - Maximum signal lifetime (default 120 min)
   */
  calculateTimeDecay(
    originalConfidence: number,
    createdAt: number,
    halfLifeMinutes: number = 30,
    maxLifeMinutes: number = 120
  ): TimedSignal {
    const now = Date.now();
    const elapsedMs = now - createdAt;
    const minutesElapsed = elapsedMs / (1000 * 60);

    const expiresAt = createdAt + (maxLifeMinutes * 60 * 1000);
    const isExpired = now > expiresAt;

    // Exponential decay: e^(-t/halfLife)
    // At t = halfLife, decayFactor = e^(-1) ≈ 0.368
    // We use natural log: decay = e^(-0.693 × t / halfLife) so at halfLife, factor = 0.5
    const decayConstant = 0.693 / halfLifeMinutes; // ln(2) / halfLife
    const decayFactor = Math.exp(-decayConstant * minutesElapsed);

    const currentConfidence = isExpired ? 0 : originalConfidence * decayFactor;

    return {
      originalConfidence,
      currentConfidence: Math.round(currentConfidence * 100) / 100,
      createdAt,
      expiresAt,
      halfLifeMinutes,
      isExpired,
      minutesElapsed: Math.round(minutesElapsed * 10) / 10,
      decayFactor: Math.round(decayFactor * 1000) / 1000,
    };
  }

  /**
   * Detect support and resistance zones from price action
   * Uses swing highs/lows and price clustering
   *
   * @param candles - Price data
   * @param lookback - Number of candles to analyze (default 100)
   * @param zoneTolerance - % tolerance for grouping levels (default 0.5%)
   */
  detectSupportResistance(
    candles: CandleData[],
    lookback: number = 100,
    zoneTolerance: number = 0.5
  ): SupportResistanceZones {
    const recentCandles = candles.slice(-lookback);
    const currentPrice = recentCandles[recentCandles.length - 1].close;

    // Find swing highs and lows
    const swingHighs: number[] = [];
    const swingLows: number[] = [];

    for (let i = 2; i < recentCandles.length - 2; i++) {
      const candle = recentCandles[i];
      const prev1 = recentCandles[i - 1];
      const prev2 = recentCandles[i - 2];
      const next1 = recentCandles[i + 1];
      const next2 = recentCandles[i + 2];

      // Swing high: higher than 2 candles on each side
      if (candle.high > prev1.high && candle.high > prev2.high &&
          candle.high > next1.high && candle.high > next2.high) {
        swingHighs.push(candle.high);
      }

      // Swing low: lower than 2 candles on each side
      if (candle.low < prev1.low && candle.low < prev2.low &&
          candle.low < next1.low && candle.low < next2.low) {
        swingLows.push(candle.low);
      }
    }

    // Group nearby levels into zones
    const groupLevels = (levels: number[]): { price: number; strength: number; touches: number }[] => {
      if (levels.length === 0) return [];

      const sorted = [...levels].sort((a, b) => a - b);
      const zones: { price: number; strength: number; touches: number }[] = [];

      let currentZone = { sum: sorted[0], count: 1 };

      for (let i = 1; i < sorted.length; i++) {
        const avgPrice = currentZone.sum / currentZone.count;
        const tolerance = avgPrice * (zoneTolerance / 100);

        if (Math.abs(sorted[i] - avgPrice) <= tolerance) {
          currentZone.sum += sorted[i];
          currentZone.count++;
        } else {
          zones.push({
            price: currentZone.sum / currentZone.count,
            strength: Math.min(100, currentZone.count * 25),
            touches: currentZone.count,
          });
          currentZone = { sum: sorted[i], count: 1 };
        }
      }

      // Add last zone
      zones.push({
        price: currentZone.sum / currentZone.count,
        strength: Math.min(100, currentZone.count * 25),
        touches: currentZone.count,
      });

      return zones;
    };

    const supports = groupLevels(swingLows).filter(z => z.price < currentPrice);
    const resistances = groupLevels(swingHighs).filter(z => z.price > currentPrice);

    // Find nearest levels
    const nearestSupport = supports.length > 0
      ? supports.reduce((a, b) => a.price > b.price ? a : b).price
      : null;

    const nearestResistance = resistances.length > 0
      ? resistances.reduce((a, b) => a.price < b.price ? a : b).price
      : null;

    // Calculate distances
    const distanceToSupport = nearestSupport
      ? ((currentPrice - nearestSupport) / currentPrice) * 100
      : 100;

    const distanceToResistance = nearestResistance
      ? ((nearestResistance - currentPrice) / currentPrice) * 100
      : 100;

    // Determine current zone
    let currentZone: SupportResistanceZones['currentZone'];
    if (distanceToSupport < 1) {
      currentZone = 'NEAR_SUPPORT';
    } else if (distanceToResistance < 1) {
      currentZone = 'NEAR_RESISTANCE';
    } else if (!nearestSupport || !nearestResistance) {
      currentZone = 'BREAKOUT';
    } else {
      currentZone = 'MID_RANGE';
    }

    return {
      supports: supports.slice(-5), // Top 5 nearest
      resistances: resistances.slice(0, 5), // Top 5 nearest
      nearestSupport,
      nearestResistance,
      currentZone,
      distanceToSupport,
      distanceToResistance,
    };
  }

  /**
   * Analyze BTC correlation for altcoin signals
   * Don't fight the market - if BTC is dumping, long signals are riskier
   *
   * @param btcCandles - BTC price data
   * @param signalType - The signal being generated (BUY/SELL)
   * @param lookbackMinutes - Period to analyze BTC movement (default 60)
   */
  analyzeBTCCorrelation(
    btcCandles: CandleData[],
    signalType: 'BUY' | 'SELL',
    lookbackMinutes: number = 60
  ): BTCCorrelation {
    if (btcCandles.length < 4) {
      return {
        btcTrend: 'NEUTRAL',
        btcMomentum: 0,
        correlationImpact: 'NEUTRAL',
        confidenceAdjustment: 0,
      };
    }

    // Calculate BTC momentum over lookback period
    // Assuming 15-min candles, 60 min = 4 candles
    const candlesNeeded = Math.ceil(lookbackMinutes / 15);
    const startIdx = Math.max(0, btcCandles.length - candlesNeeded);
    const startPrice = btcCandles[startIdx].close;
    const endPrice = btcCandles[btcCandles.length - 1].close;
    const btcMomentum = ((endPrice - startPrice) / startPrice) * 100;

    // Determine BTC trend
    let btcTrend: BTCCorrelation['btcTrend'];
    if (btcMomentum > 1) {
      btcTrend = 'BULLISH';
    } else if (btcMomentum < -1) {
      btcTrend = 'BEARISH';
    } else {
      btcTrend = 'NEUTRAL';
    }

    // Determine impact on signal
    let correlationImpact: BTCCorrelation['correlationImpact'];
    let confidenceAdjustment = 0;
    let warning: string | undefined;

    if (signalType === 'BUY') {
      if (btcTrend === 'BULLISH') {
        correlationImpact = 'FAVORABLE';
        confidenceAdjustment = 10;
      } else if (btcTrend === 'BEARISH') {
        correlationImpact = 'UNFAVORABLE';
        confidenceAdjustment = -20;
        if (btcMomentum < -3) {
          warning = `BTC dropping ${Math.abs(btcMomentum).toFixed(1)}% - long positions high risk`;
        }
      } else {
        correlationImpact = 'NEUTRAL';
      }
    } else { // SELL signal
      if (btcTrend === 'BEARISH') {
        correlationImpact = 'FAVORABLE';
        confidenceAdjustment = 10;
      } else if (btcTrend === 'BULLISH') {
        correlationImpact = 'UNFAVORABLE';
        confidenceAdjustment = -15;
        if (btcMomentum > 3) {
          warning = `BTC pumping ${btcMomentum.toFixed(1)}% - short positions high risk`;
        }
      } else {
        correlationImpact = 'NEUTRAL';
      }
    }

    return {
      btcTrend,
      btcMomentum,
      correlationImpact,
      confidenceAdjustment,
      warning,
    };
  }

  /**
   * Multi-timeframe analysis
   * Compares primary timeframe signal with higher timeframe trend
   *
   * @param primaryCandles - Primary timeframe candles (e.g., 15m)
   * @param higherCandles - Higher timeframe candles (e.g., 1h)
   * @param primaryTF - Primary timeframe label
   * @param higherTF - Higher timeframe label
   */
  analyzeMultiTimeframe(
    primaryCandles: CandleData[],
    higherCandles: CandleData[],
    primaryTF: string = '15m',
    higherTF: string = '1h'
  ): MultiTimeframeAnalysis {
    // Analyze primary timeframe
    const primaryEMAs = this.calculateEMAs(primaryCandles.map(c => c.close));
    let primaryTrend: MultiTimeframeAnalysis['primaryTrend'] = 'NEUTRAL';

    if (primaryEMAs.ema9 && primaryEMAs.ema21) {
      if (primaryEMAs.ema9 > primaryEMAs.ema21) {
        primaryTrend = 'BULLISH';
      } else if (primaryEMAs.ema9 < primaryEMAs.ema21) {
        primaryTrend = 'BEARISH';
      }
    }

    // Analyze higher timeframe
    const higherEMAs = this.calculateEMAs(higherCandles.map(c => c.close));
    let higherTrend: MultiTimeframeAnalysis['higherTrend'] = 'NEUTRAL';

    if (higherEMAs.ema9 && higherEMAs.ema21) {
      if (higherEMAs.ema9 > higherEMAs.ema21) {
        higherTrend = 'BULLISH';
      } else if (higherEMAs.ema9 < higherEMAs.ema21) {
        higherTrend = 'BEARISH';
      }
    }

    // Determine alignment
    let alignment: MultiTimeframeAnalysis['alignment'];
    let confidenceAdjustment = 0;
    let recommendation = '';

    if (primaryTrend === higherTrend && primaryTrend !== 'NEUTRAL') {
      alignment = 'ALIGNED';
      confidenceAdjustment = 15;
      recommendation = `${primaryTF} and ${higherTF} trends aligned ${primaryTrend} - high confidence`;
    } else if (
      (primaryTrend === 'BULLISH' && higherTrend === 'BEARISH') ||
      (primaryTrend === 'BEARISH' && higherTrend === 'BULLISH')
    ) {
      alignment = 'CONFLICTING';
      confidenceAdjustment = -25;
      recommendation = `${primaryTF} ${primaryTrend} vs ${higherTF} ${higherTrend} - counter-trend trade, reduce size`;
    } else {
      alignment = 'NEUTRAL';
      confidenceAdjustment = 0;
      recommendation = `Mixed signals across timeframes - proceed with caution`;
    }

    return {
      primaryTimeframe: primaryTF,
      higherTimeframe: higherTF,
      primaryTrend,
      higherTrend,
      alignment,
      confidenceAdjustment,
      recommendation,
    };
  }

  /**
   * Calculate dynamic position sizing based on volatility and confidence
   *
   * @param confidence - Signal confidence (0-100)
   * @param atrPercent - ATR as % of price
   * @param accountRiskPercent - Max % of account to risk per trade (default 2%)
   * @param winRate - Historical win rate for Kelly criterion (default 0.55)
   */
  calculatePositionSizing(
    confidence: number,
    atrPercent: number | null,
    accountRiskPercent: number = 2,
    winRate: number = 0.55
  ): PositionSizing {
    const reasoning: string[] = [];

    // Base size from confidence
    // 70% confidence = 70% of max size
    // 100% confidence = 100% of max size
    const confidenceAdjustment = confidence / 100;
    reasoning.push(`Confidence ${confidence}% → ${(confidenceAdjustment * 100).toFixed(0)}% size factor`);

    // Volatility adjustment (inverse - higher vol = smaller size)
    // Normal ATR ~2%, Low < 1.5%, High > 3%
    let volatilityAdjustment = 1;
    if (atrPercent !== null) {
      if (atrPercent < 1.5) {
        volatilityAdjustment = 1.2; // Low vol, can size up
        reasoning.push(`Low volatility (ATR ${atrPercent.toFixed(2)}%) → 120% size`);
      } else if (atrPercent > 4) {
        volatilityAdjustment = 0.5; // High vol, size down
        reasoning.push(`High volatility (ATR ${atrPercent.toFixed(2)}%) → 50% size`);
      } else if (atrPercent > 3) {
        volatilityAdjustment = 0.7;
        reasoning.push(`Elevated volatility (ATR ${atrPercent.toFixed(2)}%) → 70% size`);
      } else {
        reasoning.push(`Normal volatility (ATR ${atrPercent.toFixed(2)}%) → 100% size`);
      }
    }

    // Kelly Criterion: f* = (bp - q) / b
    // Where b = win/loss ratio, p = win probability, q = 1-p
    // Simplified: assuming 1.5:1 R:R
    const b = 1.5; // Risk:Reward ratio
    const p = winRate;
    const q = 1 - p;
    const kellyFraction = Math.max(0, (b * p - q) / b);
    reasoning.push(`Kelly criterion (${(winRate * 100).toFixed(0)}% win rate, 1.5:1 R:R) → ${(kellyFraction * 100).toFixed(1)}% of capital`);

    // Calculate final size
    const baseSize = accountRiskPercent * 10; // 2% risk = 20% position (with 1.5:1)
    const recommendedSize = Math.min(
      baseSize * confidenceAdjustment * volatilityAdjustment,
      50 // Hard cap at 50%
    );

    // Max size is half-Kelly for safety
    const maxSize = Math.min(kellyFraction * 50, 50);

    return {
      recommendedSize: Math.round(recommendedSize * 10) / 10,
      maxSize: Math.round(maxSize * 10) / 10,
      volatilityAdjustment,
      confidenceAdjustment,
      riskPerTrade: accountRiskPercent,
      kellyFraction: Math.round(kellyFraction * 1000) / 1000,
      reasoning,
    };
  }

  /**
   * Detect common candlestick patterns
   *
   * @param candles - Recent candles (needs at least 3)
   */
  detectCandlestickPatterns(candles: CandleData[]): CandlestickPattern[] {
    const patterns: CandlestickPattern[] = [];

    if (candles.length < 3) return patterns;

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    const bodySize = Math.abs(current.close - current.open);
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const totalRange = current.high - current.low;

    const isBullish = current.close > current.open;
    const isBearish = current.close < current.open;

    // Doji - small body, long wicks
    if (bodySize < totalRange * 0.1 && totalRange > 0) {
      patterns.push({
        pattern: 'DOJI',
        type: 'NEUTRAL',
        reliability: 60,
        description: 'Doji indicates indecision - potential reversal',
      });
    }

    // Hammer - small body at top, long lower wick
    if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5 && isBullish) {
      patterns.push({
        pattern: 'HAMMER',
        type: 'BULLISH',
        reliability: 70,
        description: 'Hammer at support suggests bullish reversal',
      });
    }

    // Inverted Hammer
    if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && isBullish) {
      patterns.push({
        pattern: 'INVERTED_HAMMER',
        type: 'BULLISH',
        reliability: 65,
        description: 'Inverted hammer suggests potential reversal',
      });
    }

    // Shooting Star - small body at bottom, long upper wick
    if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && isBearish) {
      patterns.push({
        pattern: 'SHOOTING_STAR',
        type: 'BEARISH',
        reliability: 70,
        description: 'Shooting star at resistance suggests bearish reversal',
      });
    }

    // Bullish Engulfing
    const prevBodySize = Math.abs(prev.close - prev.open);
    if (
      prev.close < prev.open && // Previous was bearish
      current.close > current.open && // Current is bullish
      current.open < prev.close && // Opens below prev close
      current.close > prev.open // Closes above prev open
    ) {
      patterns.push({
        pattern: 'BULLISH_ENGULFING',
        type: 'BULLISH',
        reliability: 75,
        description: 'Bullish engulfing - strong reversal signal',
      });
    }

    // Bearish Engulfing
    if (
      prev.close > prev.open && // Previous was bullish
      current.close < current.open && // Current is bearish
      current.open > prev.close && // Opens above prev close
      current.close < prev.open // Closes below prev open
    ) {
      patterns.push({
        pattern: 'BEARISH_ENGULFING',
        type: 'BEARISH',
        reliability: 75,
        description: 'Bearish engulfing - strong reversal signal',
      });
    }

    // Morning Star (3-candle bullish reversal)
    if (
      prev2.close < prev2.open && // First candle bearish
      Math.abs(prev.close - prev.open) < prevBodySize * 0.5 && // Middle small
      current.close > current.open && // Third bullish
      current.close > (prev2.open + prev2.close) / 2 // Closes above midpoint
    ) {
      patterns.push({
        pattern: 'MORNING_STAR',
        type: 'BULLISH',
        reliability: 80,
        description: 'Morning star - strong bullish reversal pattern',
      });
    }

    // Evening Star (3-candle bearish reversal)
    if (
      prev2.close > prev2.open && // First candle bullish
      Math.abs(prev.close - prev.open) < prevBodySize * 0.5 && // Middle small
      current.close < current.open && // Third bearish
      current.close < (prev2.open + prev2.close) / 2 // Closes below midpoint
    ) {
      patterns.push({
        pattern: 'EVENING_STAR',
        type: 'BEARISH',
        reliability: 80,
        description: 'Evening star - strong bearish reversal pattern',
      });
    }

    return patterns;
  }

  /**
   * Generate AI-friendly description of the current market setup
   * This can be enhanced by actual AI to provide more context
   */
  generatePatternDescription(
    candles: CandleData[],
    indicators: TechnicalIndicatorValues,
    trendStrength: TrendStrength,
    supportResistance: SupportResistanceZones
  ): string {
    const parts: string[] = [];

    // Price action
    const currentPrice = candles[candles.length - 1].close;
    const priceChange24h = candles.length > 96
      ? ((currentPrice - candles[candles.length - 96].close) / candles[candles.length - 96].close) * 100
      : 0;

    parts.push(`Price: $${currentPrice.toFixed(2)} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}% 24h)`);

    // Trend
    if (trendStrength.shouldTrade) {
      parts.push(`Trend: ${trendStrength.trendStrength} ${trendStrength.trendDirection} (ADX: ${trendStrength.adx.toFixed(1)})`);
    } else {
      parts.push(`No clear trend (ADX: ${trendStrength.adx.toFixed(1)} - ranging market)`);
    }

    // RSI
    if (indicators.rsi < 30) {
      parts.push(`RSI oversold at ${indicators.rsi.toFixed(1)} - potential bounce`);
    } else if (indicators.rsi > 70) {
      parts.push(`RSI overbought at ${indicators.rsi.toFixed(1)} - potential pullback`);
    } else {
      parts.push(`RSI neutral at ${indicators.rsi.toFixed(1)}`);
    }

    // Support/Resistance context
    if (supportResistance.currentZone === 'NEAR_SUPPORT') {
      parts.push(`Testing support at $${supportResistance.nearestSupport?.toFixed(2)}`);
    } else if (supportResistance.currentZone === 'NEAR_RESISTANCE') {
      parts.push(`Testing resistance at $${supportResistance.nearestResistance?.toFixed(2)}`);
    }

    // MACD
    if (indicators.macd.histogram > 0 && indicators.macd.MACD > indicators.macd.signal) {
      parts.push('MACD bullish with positive momentum');
    } else if (indicators.macd.histogram < 0 && indicators.macd.MACD < indicators.macd.signal) {
      parts.push('MACD bearish with negative momentum');
    }

    return parts.join('. ') + '.';
  }

  /**
   * Indicator weights for weighted confluence scoring
   * Based on general reliability in crypto markets
   */
  private readonly INDICATOR_WEIGHTS: Record<string, { weight: number; reliability: number }> = {
    RSI_OVERSOLD: { weight: 1.2, reliability: 70 },
    RSI_OVERBOUGHT: { weight: 1.2, reliability: 70 },
    RSI_APPROACHING: { weight: 0.8, reliability: 55 },
    MACD_BULLISH: { weight: 1.0, reliability: 65 },
    MACD_BEARISH: { weight: 1.0, reliability: 65 },
    BB_LOWER_TOUCH: { weight: 0.9, reliability: 60 },
    BB_UPPER_TOUCH: { weight: 0.9, reliability: 60 },
    BB_NEAR: { weight: 0.6, reliability: 50 },
    EMA_ALIGNED: { weight: 1.1, reliability: 72 },
    EMA_CROSS: { weight: 0.9, reliability: 62 },
    VOLUME_SPIKE: { weight: 1.3, reliability: 75 },
    VOLUME_DRY: { weight: 0.7, reliability: 45 },
    MOMENTUM: { weight: 0.8, reliability: 55 },
    SUPPORT_RESISTANCE: { weight: 1.0, reliability: 65 },
    ADX_TREND: { weight: 1.2, reliability: 70 },
    PATTERN: { weight: 1.1, reliability: 68 },
  };

  /**
   * Calculate weighted confluence score
   * Instead of simple addition, applies weights based on indicator reliability
   */
  calculateWeightedScore(
    scores: { indicator: string; rawScore: number }[]
  ): { weightedScores: WeightedScore[]; totalWeightedScore: number } {
    const weightedScores: WeightedScore[] = [];
    let totalWeighted = 0;
    let totalWeight = 0;

    for (const score of scores) {
      const config = this.INDICATOR_WEIGHTS[score.indicator] || { weight: 1, reliability: 50 };
      const weightedScore = score.rawScore * config.weight;

      weightedScores.push({
        indicator: score.indicator,
        rawScore: score.rawScore,
        weight: config.weight,
        weightedScore,
        reliability: config.reliability,
      });

      totalWeighted += weightedScore;
      totalWeight += config.weight;
    }

    // Normalize to 0-100 scale
    const totalWeightedScore = totalWeight > 0
      ? Math.min(100, (totalWeighted / totalWeight) * (totalWeighted / 50))
      : 0;

    return { weightedScores, totalWeightedScore };
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
    const recentCandles = candles.slice(-40);
    const momentumLookback = Math.min(5, candles.length - 1);
    const momentumBaseline = candles[candles.length - 1 - momentumLookback]?.close || currentPrice;
    const priceMomentum = ((currentPrice - momentumBaseline) / momentumBaseline) * 100;

    const volumes = recentCandles.map(c => c.volume || 0);
    const avgVolume =
      volumes.length > 0 ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : 0;
    const latestVolume = volumes[volumes.length - 1] || 0;
    const volumeTrend = avgVolume > 0 ? ((latestVolume - avgVolume) / avgVolume) * 100 : null;

    const recentHigh = Math.max(...recentCandles.map(c => c.high));
    const recentLow = Math.min(...recentCandles.map(c => c.low));
    const rangePosition =
      recentHigh !== recentLow
        ? ((currentPrice - recentLow) / (recentHigh - recentLow)) * 100
        : 50;

    const rsi = this.calculateRSI(closePrices);
    const macd = this.calculateMACD(closePrices);
    const bb = this.calculateBollingerBands(closePrices);
    const emas = this.calculateEMAs(closePrices);
    const sma20 = this.calculateSMA(closePrices);
    const atr = this.calculateATR(candles);

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
      volumeTrend,
      priceMomentum,
      rangePosition,
      atr: atr || undefined,
    };
  }

  /**
   * Multi-Strategy Confluence Signal Generator
   * Combines RSI, MACD, Bollinger Bands, and EMA for high-probability signals
   *
   * KEY PRINCIPLE: MACD is the trend/momentum filter
   * - Bollinger Band signals require MACD confirmation (bounce vs breakdown)
   * - RSI + MACD conflict = reduced confidence + AI review flag
   */
  generateConfluenceSignal(candles: CandleData[]): SignalResult | null {
    const indicators = this.calculateAllIndicators(candles);
    if (!indicators) return null;

    const currentPrice = candles[candles.length - 1].close;
    const previousPrice = candles[candles.length - 2]?.close || currentPrice;

    const signals: string[] = [];
    let buyScore = 0;
    let sellScore = 0;
    let hasConflict = false;
    let conflictReason = '';

    // FIRST: Determine MACD trend direction (this filters other signals)
    const macdBullish = indicators.macd.MACD > indicators.macd.signal && indicators.macd.histogram > 0;
    const macdBearish = indicators.macd.MACD < indicators.macd.signal && indicators.macd.histogram < 0;
    const macdNeutral = !macdBullish && !macdBearish;

    // Calculate adaptive RSI thresholds based on ATR volatility
    const rsiThresholds = this.calculateAdaptiveRSIThresholds(candles);

    // Strategy 1: RSI Analysis with ADAPTIVE thresholds based on volatility
    // Higher volatility = wider thresholds (need more extreme readings)
    // Lower volatility = tighter thresholds (react to smaller moves)
    let rsiBullish = false;
    let rsiBearish = false;

    if (indicators.rsi < rsiThresholds.oversold) {
      rsiBullish = true;
      buyScore += 25;
      signals.push(`RSI oversold (${indicators.rsi.toFixed(2)} < ${rsiThresholds.oversold}) [${rsiThresholds.volatilityLevel} vol]`);
    } else if (indicators.rsi < rsiThresholds.approachingOversold) {
      rsiBullish = true;
      buyScore += 15;
      signals.push(`RSI approaching oversold (${indicators.rsi.toFixed(2)} < ${rsiThresholds.approachingOversold}) [${rsiThresholds.volatilityLevel} vol]`);
    } else if (indicators.rsi > rsiThresholds.overbought) {
      rsiBearish = true;
      sellScore += 25;
      signals.push(`RSI overbought (${indicators.rsi.toFixed(2)} > ${rsiThresholds.overbought}) [${rsiThresholds.volatilityLevel} vol]`);
    } else if (indicators.rsi > rsiThresholds.approachingOverbought) {
      rsiBearish = true;
      sellScore += 15;
      signals.push(`RSI approaching overbought (${indicators.rsi.toFixed(2)} > ${rsiThresholds.approachingOverbought}) [${rsiThresholds.volatilityLevel} vol]`);
    }

    // Strategy 2: MACD Crossover (Fast settings: 3/10/9)
    if (macdBullish) {
      buyScore += 25;
      signals.push('MACD bullish crossover');
    } else if (macdBearish) {
      sellScore += 25;
      signals.push('MACD bearish crossover');
    }

    // CONFLICT DETECTION: RSI vs MACD disagreement
    // This is critical - oversold RSI with bearish MACD often means continued downtrend
    if (rsiBullish && macdBearish) {
      hasConflict = true;
      conflictReason = 'RSI oversold but MACD bearish - potential continued downtrend';
      // Penalty: reduce buy score, this is often a falling knife
      buyScore -= 15;
      sellScore += 10;
      signals.push('⚠️ RSI/MACD conflict: bearish momentum despite oversold');
    } else if (rsiBearish && macdBullish) {
      hasConflict = true;
      conflictReason = 'RSI overbought but MACD bullish - potential continued uptrend';
      // Penalty: reduce sell score, strong momentum can push through overbought
      sellScore -= 15;
      buyScore += 10;
      signals.push('⚠️ RSI/MACD conflict: bullish momentum despite overbought');
    }

    // Strategy 3: Bollinger Bands WITH MACD CONFIRMATION
    // Key insight: Lower BB + bearish MACD = breakdown, not bounce
    const bbPosition = (currentPrice - indicators.bollingerBands.lower) /
                       (indicators.bollingerBands.upper - indicators.bollingerBands.lower);

    if (currentPrice <= indicators.bollingerBands.lower) {
      if (macdBullish || macdNeutral) {
        // MACD confirms potential bounce
        buyScore += 30;
        signals.push('Price at lower BB with MACD confirmation (bounce likely)');
      } else {
        // MACD bearish = breakdown, not bounce - this is a SELL signal
        sellScore += 20;
        signals.push('Price at lower BB but MACD bearish (breakdown risk)');
        if (!hasConflict) {
          hasConflict = true;
          conflictReason = 'Lower BB touch with bearish MACD - breakdown vs bounce uncertainty';
        }
      }
    } else if (bbPosition < 0.3) {
      if (macdBullish) {
        buyScore += 20;
        signals.push('Price near lower BB with bullish MACD');
      } else if (macdBearish) {
        // Near lower BB but bearish - cautious, reduced score
        buyScore += 5;
        signals.push('Price near lower BB (MACD not confirming bounce)');
      } else {
        buyScore += 10;
        signals.push('Price near lower Bollinger Band');
      }
    } else if (currentPrice >= indicators.bollingerBands.upper) {
      if (macdBearish || macdNeutral) {
        // MACD confirms potential reversal
        sellScore += 30;
        signals.push('Price at upper BB with MACD confirmation (reversal likely)');
      } else {
        // MACD bullish = breakout, not reversal - this could continue up
        buyScore += 15;
        signals.push('Price at upper BB but MACD bullish (breakout possible)');
        if (!hasConflict) {
          hasConflict = true;
          conflictReason = 'Upper BB touch with bullish MACD - breakout vs reversal uncertainty';
        }
      }
    } else if (bbPosition > 0.7) {
      if (macdBearish) {
        sellScore += 20;
        signals.push('Price near upper BB with bearish MACD');
      } else if (macdBullish) {
        sellScore += 5;
        signals.push('Price near upper BB (MACD not confirming reversal)');
      } else {
        sellScore += 10;
        signals.push('Price near upper Bollinger Band');
      }
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

    // Strategy 5: Volume confirmation using PERCENTILE-BASED analysis
    // Instead of arbitrary % thresholds, use statistical ranking
    const volumes = candles.map(c => c.volume || 0);
    const volumeAnalysis = this.analyzeVolume(volumes);

    if (volumeAnalysis.isSpike) {
      // Volume in top 20% (80th+ percentile) - significant activity
      // High volume on up moves = bullish, high volume on down moves = bearish
      if (indicators.priceMomentum && indicators.priceMomentum > 0) {
        buyScore += 15;
        signals.push(`Volume spike (${volumeAnalysis.percentileRank.toFixed(0)}th percentile) confirms buyers`);
      } else if (indicators.priceMomentum && indicators.priceMomentum < 0) {
        sellScore += 15;
        signals.push(`Volume spike (${volumeAnalysis.percentileRank.toFixed(0)}th percentile) confirms sellers`);
      } else {
        // High volume but neutral price - potential breakout setup
        buyScore += 5;
        sellScore += 5;
        signals.push(`Volume spike (${volumeAnalysis.percentileRank.toFixed(0)}th percentile) - breakout potential`);
      }
    } else if (volumeAnalysis.isDry) {
      // Volume in bottom 20% (20th- percentile) - lack of conviction
      // Low volume moves are less reliable
      if (buyScore > sellScore && buyScore > 0) {
        buyScore -= 5;
        signals.push(`Low volume (${volumeAnalysis.percentileRank.toFixed(0)}th percentile) - buy signal less reliable`);
      } else if (sellScore > buyScore && sellScore > 0) {
        sellScore -= 5;
        signals.push(`Low volume (${volumeAnalysis.percentileRank.toFixed(0)}th percentile) - sell signal less reliable`);
      }
    }

    // Strategy 6: Short-term price momentum
    if (typeof indicators.priceMomentum === 'number') {
      if (indicators.priceMomentum > 1.2) {
        buyScore += 10;
        signals.push(`Positive momentum (${indicators.priceMomentum.toFixed(2)}%)`);
      } else if (indicators.priceMomentum < -1.2) {
        sellScore += 10;
        signals.push(`Negative momentum (${indicators.priceMomentum.toFixed(2)}%)`);
      }
    }

    // Strategy 7: Local range positioning (support/resistance awareness)
    if (typeof indicators.rangePosition === 'number') {
      if (indicators.rangePosition <= 20) {
        buyScore += 10;
        signals.push('Price sitting on local support');
      } else if (indicators.rangePosition >= 80) {
        sellScore += 10;
        signals.push('Price testing local resistance');
      }
    }

    // Ensure scores don't go negative
    buyScore = Math.max(0, buyScore);
    sellScore = Math.max(0, sellScore);

    // Determine signal type and strength based on confluence score
    const normalizedBuyScore = Math.min(Math.round(buyScore), 100);
    const normalizedSellScore = Math.min(Math.round(sellScore), 100);

    let signalType: 'BUY' | 'SELL' | 'HOLD';
    let strength: 'STRONG' | 'MODERATE' | 'WEAK';
    let confidence: number;
    let message: string;

    // Minimum 70% confidence required - NO WEAK SIGNALS
    // STRONG: 80%+, MODERATE: 70-79%
    if (normalizedBuyScore > normalizedSellScore && normalizedBuyScore >= 70) {
      signalType = 'BUY';
      strength = normalizedBuyScore >= 80 ? 'STRONG' : 'MODERATE';
      confidence = normalizedBuyScore;
      message = `${strength} BUY signal with ${normalizedBuyScore}% confluence: ${signals.join(', ')}`;
    } else if (normalizedSellScore > normalizedBuyScore && normalizedSellScore >= 70) {
      signalType = 'SELL';
      strength = normalizedSellScore >= 80 ? 'STRONG' : 'MODERATE';
      confidence = normalizedSellScore;
      message = `${strength} SELL signal with ${normalizedSellScore}% confluence: ${signals.join(', ')}`;
    } else {
      signalType = 'HOLD';
      strength = 'MODERATE';
      confidence = Math.max(normalizedBuyScore, normalizedSellScore);
      message = `HOLD - No strong confluence. Buy score: ${normalizedBuyScore}%, Sell score: ${normalizedSellScore}%. ${signals.join(', ') || 'Neutral indicators'}`;
    }

    return {
      type: signalType,
      strength,
      confidence,
      indicators,
      signals,
      message,
      hasConflict,
      conflictReason,
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
