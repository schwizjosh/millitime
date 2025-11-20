/**
 * Multi-Timeframe Analysis Service
 * Combines signals from 1H, 4H, and 1D timeframes for higher accuracy
 *
 * QUICK WIN IMPLEMENTATION
 * Expected improvement: +2-3% accuracy
 */

import { technicalIndicatorService, SignalResult, CandleData } from './technicalIndicators';

export interface MultiTimeframeSignal {
  signal1H: SignalResult | null;
  signal4H: SignalResult | null;
  signal1D: SignalResult | null;
  alignedSignal: 'BUY' | 'SELL' | 'HOLD';
  alignmentStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidenceAdjustment: number; // -30% to +10%
  reasoning: string[];
}

export class MultiTimeframeAnalyzer {
  /**
   * Analyze signals across multiple timeframes
   * Returns adjusted signal based on timeframe alignment
   */
  analyzeTimeframes(
    candles1H: CandleData[] | null,
    candles4H: CandleData[] | null,
    candles1D: CandleData[] | null
  ): MultiTimeframeSignal {
    // Generate signals for each timeframe
    const signal1H = candles1H ? technicalIndicatorService.generateConfluenceSignal(candles1H) : null;
    const signal4H = candles4H ? technicalIndicatorService.generateConfluenceSignal(candles4H) : null;
    const signal1D = candles1D ? technicalIndicatorService.generateConfluenceSignal(candles1D) : null;

    // Determine alignment
    const alignment = this.checkAlignment(signal1H, signal4H, signal1D);

    return {
      signal1H,
      signal4H,
      signal1D,
      alignedSignal: alignment.signal,
      alignmentStrength: alignment.strength,
      confidenceAdjustment: alignment.confidenceAdjustment,
      reasoning: alignment.reasoning,
    };
  }

  /**
   * Check if signals align across timeframes
   * Higher timeframes have more weight
   */
  private checkAlignment(
    signal1H: SignalResult | null,
    signal4H: SignalResult | null,
    signal1D: SignalResult | null
  ): {
    signal: 'BUY' | 'SELL' | 'HOLD';
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    confidenceAdjustment: number;
    reasoning: string[];
  } {
    const reasoning: string[] = [];

    // If 1H signal doesn't exist, can't proceed
    if (!signal1H) {
      return {
        signal: 'HOLD',
        strength: 'WEAK',
        confidenceAdjustment: -50,
        reasoning: ['No 1H signal available'],
      };
    }

    // Case 1: ALL timeframes align (BEST CASE)
    if (
      signal1H &&
      signal4H &&
      signal1D &&
      signal1H.type === signal4H.type &&
      signal4H.type === signal1D.type &&
      (signal1H.type === 'BUY' || signal1H.type === 'SELL')
    ) {
      reasoning.push(`Perfect alignment: 1H, 4H, 1D all ${signal1H.type}`);
      reasoning.push(`Trend confirmed across all timeframes`);

      return {
        signal: signal1H.type,
        strength: 'STRONG',
        confidenceAdjustment: 10, // Boost confidence by 10%
        reasoning,
      };
    }

    // Case 2: 1H and 4H align, 1D missing or neutral
    if (
      signal1H &&
      signal4H &&
      signal1H.type === signal4H.type &&
      (signal1H.type === 'BUY' || signal1H.type === 'SELL')
    ) {
      if (!signal1D || signal1D.type === 'HOLD') {
        reasoning.push(`Good alignment: 1H and 4H both ${signal1H.type}`);
        reasoning.push('1D neutral - proceed with caution');

        return {
          signal: signal1H.type,
          strength: 'MODERATE',
          confidenceAdjustment: 5, // Slight boost
          reasoning,
        };
      }
    }

    // Case 3: 1H and 1D align, 4H conflicts
    if (
      signal1H &&
      signal1D &&
      signal1H.type === signal1D.type &&
      (signal1H.type === 'BUY' || signal1H.type === 'SELL')
    ) {
      if (signal4H && signal4H.type !== signal1H.type) {
        reasoning.push(`Mixed signals: 1H & 1D ${signal1H.type}, but 4H ${signal4H.type}`);
        reasoning.push('4H conflict - reduce confidence');

        return {
          signal: signal1H.type,
          strength: 'WEAK',
          confidenceAdjustment: -10, // Reduce confidence
          reasoning,
        };
      }
    }

    // Case 4: Higher timeframes conflict with 1H (WORST CASE)
    if (
      (signal4H && signal4H.type !== signal1H.type && signal4H.type !== 'HOLD') ||
      (signal1D && signal1D.type !== signal1H.type && signal1D.type !== 'HOLD')
    ) {
      reasoning.push(`CONFLICT: 1H says ${signal1H.type}`);

      if (signal4H && signal4H.type !== 'HOLD' && signal4H.type !== signal1H.type) {
        reasoning.push(`4H says ${signal4H.type} - higher timeframe conflict`);
      }

      if (signal1D && signal1D.type !== 'HOLD' && signal1D.type !== signal1H.type) {
        reasoning.push(`1D says ${signal1D.type} - major trend conflict`);
      }

      reasoning.push('Trading against higher timeframes - high risk');

      return {
        signal: signal1H.type,
        strength: 'WEAK',
        confidenceAdjustment: -30, // Major confidence penalty
        reasoning,
      };
    }

    // Case 5: Only 1H available or no strong alignment
    reasoning.push(`Single timeframe: 1H ${signal1H.type}`);

    if (!signal4H && !signal1D) {
      reasoning.push('No higher timeframe confirmation available');
    }

    return {
      signal: signal1H.type,
      strength: 'WEAK',
      confidenceAdjustment: 0, // No adjustment
      reasoning,
    };
  }

  /**
   * Get summary string for logging
   */
  getSummary(mtf: MultiTimeframeSignal): string {
    const parts: string[] = [];

    if (mtf.signal1H) parts.push(`1H: ${mtf.signal1H.type}`);
    if (mtf.signal4H) parts.push(`4H: ${mtf.signal4H.type}`);
    if (mtf.signal1D) parts.push(`1D: ${mtf.signal1D.type}`);

    const alignment = `Alignment: ${mtf.alignedSignal} (${mtf.alignmentStrength})`;
    const adjustment = mtf.confidenceAdjustment >= 0
      ? `+${mtf.confidenceAdjustment}%`
      : `${mtf.confidenceAdjustment}%`;

    return `${parts.join(' | ')} | ${alignment} | Confidence: ${adjustment}`;
  }
}

export const multiTimeframeAnalyzer = new MultiTimeframeAnalyzer();
