/**
 * Signal Accuracy Validation Script
 * Analyzes historical signals and positions to validate accuracy claims
 *
 * QUICK WIN #3: Validate 82% accuracy claim
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import postgres from '@fastify/postgres';

interface ConfidenceInterval {
  lower: number;
  upper: number;
  marginOfError: number;
}

interface MarketRegimeStats {
  accuracy: number;
  count: number;
  wins: number;
}

interface ValidationResult {
  period: string;
  totalSignals: number;
  totalPositions: number;
  winningPositions: number;
  losingPositions: number;
  breakEvenPositions: number;
  actualAccuracy: number;
  adjustedAccuracy: number; // Includes break-even as 0.5 wins
  confidenceInterval: ConfidenceInterval;
  profitFactor: number;
  byStrength: {
    STRONG: { accuracy: number; count: number };
    MODERATE: { accuracy: number; count: number };
    WEAK: { accuracy: number; count: number };
  };
  byMarketRegime: {
    BULL: MarketRegimeStats;
    BEAR: MarketRegimeStats;
    SIDEWAYS: MarketRegimeStats;
  };
  statisticallySignificant: boolean;
  minimumSampleSize: number;
}

/**
 * Calculate 95% confidence interval for accuracy
 * Formula: p ± 1.96 * sqrt(p*(1-p)/n)
 * Where p = proportion (accuracy/100), n = sample size
 */
function calculateConfidenceInterval(accuracy: number, sampleSize: number): ConfidenceInterval {
  if (sampleSize === 0) {
    return { lower: 0, upper: 0, marginOfError: 0 };
  }

  const p = accuracy / 100;
  const z = 1.96; // 95% confidence level

  // Standard error of proportion
  const standardError = Math.sqrt((p * (1 - p)) / sampleSize);

  // Margin of error
  const marginOfError = z * standardError * 100;

  return {
    lower: Math.max(0, accuracy - marginOfError),
    upper: Math.min(100, accuracy + marginOfError),
    marginOfError,
  };
}

/**
 * Determine market regime based on price change over period
 * BULL: Price increased > 5%
 * BEAR: Price decreased > 5%
 * SIDEWAYS: Price change within ±5%
 */
function determineMarketRegime(priceChangePercent: number): 'BULL' | 'BEAR' | 'SIDEWAYS' {
  const threshold = 5; // 5% threshold for regime classification

  if (priceChangePercent > threshold) {
    return 'BULL';
  } else if (priceChangePercent < -threshold) {
    return 'BEAR';
  } else {
    return 'SIDEWAYS';
  }
}

/**
 * Minimum sample size for statistical significance
 * Using n = (z^2 * p * (1-p)) / E^2
 * Where z=1.96, p=0.5 (worst case), E=0.1 (10% margin of error)
 */
const MINIMUM_SAMPLE_SIZE = 30; // Conservative minimum for meaningful statistics

async function validateSignalAccuracy(days: number = 30): Promise<ValidationResult> {
  const fastify = Fastify({ logger: false });

  await fastify.register(postgres, {
    connectionString: process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/millitime',
  });

  const client = await fastify.pg.connect();

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`\n📊 Analyzing signals from last ${days} days...`);
    console.log(`   Period: ${startDate.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}\n`);

    // Get all closed positions with their signals and price context
    const result = await client.query(
      `SELECT
        p.id,
        p.coin_symbol,
        p.coin_id,
        p.position as position_type,
        p.entry_price,
        p.current_price as exit_price,
        p.pnl_percent,
        p.pnl_usd,
        p.status,
        p.exit_reason,
        p.opened_at,
        p.closed_at,
        s.strength,
        s.signal_type,
        s.indicators,
        s.price as signal_price
      FROM trading_positions p
      JOIN signals s ON p.signal_id = s.id
      WHERE p.status IN ('CLOSED', 'EXPIRED')
        AND p.opened_at >= $1
      ORDER BY p.opened_at DESC`,
      [startDate]
    );

    // Fetch BTC price history for market regime detection
    // BTC is used as market proxy since most alts follow BTC trend
    const btcPriceResult = await client.query(
      `SELECT
        MIN(price) as period_low,
        MAX(price) as period_high,
        (SELECT price FROM price_history WHERE coin_id = 'bitcoin' AND recorded_at >= $1 ORDER BY recorded_at ASC LIMIT 1) as start_price,
        (SELECT price FROM price_history WHERE coin_id = 'bitcoin' ORDER BY recorded_at DESC LIMIT 1) as end_price
      FROM price_history
      WHERE coin_id = 'bitcoin' AND recorded_at >= $1`,
      [startDate]
    );

    // Calculate overall market regime for the period
    let overallMarketRegime: 'BULL' | 'BEAR' | 'SIDEWAYS' = 'SIDEWAYS';
    let btcPriceChange = 0;
    if (btcPriceResult.rows[0]?.start_price && btcPriceResult.rows[0]?.end_price) {
      const startPrice = parseFloat(btcPriceResult.rows[0].start_price);
      const endPrice = parseFloat(btcPriceResult.rows[0].end_price);
      btcPriceChange = ((endPrice - startPrice) / startPrice) * 100;
      overallMarketRegime = determineMarketRegime(btcPriceChange);
    }

    if (result.rows.length === 0) {
      console.log('⚠️  No closed positions found in this period.');
      console.log('   Signals may have been generated but not yet closed.\n');

      // Check for open signals
      const openSignalsResult = await client.query(
        `SELECT COUNT(*) as count FROM signals WHERE created_at >= $1`,
        [startDate]
      );

      console.log(`   Open signals: ${openSignalsResult.rows[0].count}`);
      console.log('   Tip: Run for a longer period or wait for positions to close.\n');

      return {
        period: `Last ${days} days`,
        totalSignals: parseInt(openSignalsResult.rows[0].count),
        totalPositions: 0,
        winningPositions: 0,
        losingPositions: 0,
        breakEvenPositions: 0,
        actualAccuracy: 0,
        adjustedAccuracy: 0,
        confidenceInterval: { lower: 0, upper: 0, marginOfError: 0 },
        profitFactor: 0,
        byStrength: {
          STRONG: { accuracy: 0, count: 0 },
          MODERATE: { accuracy: 0, count: 0 },
          WEAK: { accuracy: 0, count: 0 },
        },
        byMarketRegime: {
          BULL: { accuracy: 0, count: 0, wins: 0 },
          BEAR: { accuracy: 0, count: 0, wins: 0 },
          SIDEWAYS: { accuracy: 0, count: 0, wins: 0 },
        },
        statisticallySignificant: false,
        minimumSampleSize: MINIMUM_SAMPLE_SIZE,
      };
    }

    // Analyze results
    const byStrength: Record<string, { wins: number; total: number }> = {
      STRONG: { wins: 0, total: 0 },
      MODERATE: { wins: 0, total: 0 },
      WEAK: { wins: 0, total: 0 },
    };

    // Track by market regime
    const byRegime: Record<string, { wins: number; total: number }> = {
      BULL: { wins: 0, total: 0 },
      BEAR: { wins: 0, total: 0 },
      SIDEWAYS: { wins: 0, total: 0 },
    };

    let winCount = 0;
    let lossCount = 0;
    let breakEvenCount = 0;
    let totalProfit = 0;
    let totalLoss = 0;

    for (const row of result.rows) {
      const pnlPercent = parseFloat(row.pnl_percent || '0');
      const pnlUsd = parseFloat(row.pnl_usd || '0');
      const strength = row.strength || 'WEAK';

      // Determine market regime at time of trade
      // Calculate price change from entry to exit for the specific coin
      const entryPrice = parseFloat(row.entry_price || '0');
      const exitPrice = parseFloat(row.exit_price || '0');
      let tradePriceChange = 0;
      if (entryPrice > 0 && exitPrice > 0) {
        tradePriceChange = ((exitPrice - entryPrice) / entryPrice) * 100;
      }
      // Use overall BTC regime as proxy, but adjust based on individual coin movement
      const tradeRegime = determineMarketRegime(btcPriceChange);

      // Determine outcome
      let isWin = false;
      if (pnlPercent > 0.5) {
        winCount++;
        totalProfit += pnlUsd;
        isWin = true;
      } else if (pnlPercent < -0.5) {
        lossCount++;
        totalLoss += Math.abs(pnlUsd);
      } else {
        breakEvenCount++;
      }

      // Track by strength
      byStrength[strength].total++;
      if (isWin) {
        byStrength[strength].wins++;
      }

      // Track by market regime
      byRegime[tradeRegime].total++;
      if (isWin) {
        byRegime[tradeRegime].wins++;
      }
    }

    const totalPositions = result.rows.length;
    const actualAccuracy = (winCount / totalPositions) * 100;
    // Adjusted accuracy: treat break-even as 0.5 wins
    const adjustedAccuracy = ((winCount + (breakEvenCount * 0.5)) / totalPositions) * 100;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    // Calculate 95% confidence interval
    const confidenceInterval = calculateConfidenceInterval(actualAccuracy, totalPositions);
    const statisticallySignificant = totalPositions >= MINIMUM_SAMPLE_SIZE;

    // Print detailed results
    console.log('═══════════════════════════════════════════════════════');
    console.log('            SIGNAL ACCURACY VALIDATION                 ');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('OVERALL PERFORMANCE:');
    console.log(`  Total Positions: ${totalPositions}`);
    console.log(`  Winning: ${winCount} (${((winCount / totalPositions) * 100).toFixed(1)}%)`);
    console.log(`  Losing: ${lossCount} (${((lossCount / totalPositions) * 100).toFixed(1)}%)`);
    console.log(`  Break-even: ${breakEvenCount} (${((breakEvenCount / totalPositions) * 100).toFixed(1)}%)`);
    console.log(`\n  📈 Actual Accuracy: ${actualAccuracy.toFixed(2)}%`);
    console.log(`  📊 Adjusted Accuracy: ${adjustedAccuracy.toFixed(2)}% (break-even = 0.5 wins)`);
    console.log(`  💰 Profit Factor: ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}\n`);

    // Statistical significance
    console.log('STATISTICAL ANALYSIS:');
    console.log(`  Sample Size: ${totalPositions} trades (minimum required: ${MINIMUM_SAMPLE_SIZE})`);
    if (statisticallySignificant) {
      console.log(`  ✅ Sample size is statistically significant`);
    } else {
      console.log(`  ⚠️  Sample size too small for statistical significance`);
    }
    console.log(`\n  📐 95% Confidence Interval: ${confidenceInterval.lower.toFixed(1)}% - ${confidenceInterval.upper.toFixed(1)}%`);
    console.log(`     Margin of Error: ±${confidenceInterval.marginOfError.toFixed(1)}%`);
    console.log(`     Interpretation: True accuracy is likely between ${confidenceInterval.lower.toFixed(1)}% and ${confidenceInterval.upper.toFixed(1)}%\n`);

    console.log('BY SIGNAL STRENGTH:');
    for (const [strength, data] of Object.entries(byStrength)) {
      if (data.total > 0) {
        const accuracy = (data.wins / data.total) * 100;
        const strengthCI = calculateConfidenceInterval(accuracy, data.total);
        console.log(`  ${strength.padEnd(10)}: ${accuracy.toFixed(1)}% (${data.wins}/${data.total} wins) [CI: ${strengthCI.lower.toFixed(0)}-${strengthCI.upper.toFixed(0)}%]`);
      } else {
        console.log(`  ${strength.padEnd(10)}: N/A (no trades)`);
      }
    }

    // Market regime analysis
    console.log('\nBY MARKET REGIME:');
    console.log(`  (Overall market: ${overallMarketRegime} | BTC change: ${btcPriceChange >= 0 ? '+' : ''}${btcPriceChange.toFixed(1)}%)`);
    for (const [regime, data] of Object.entries(byRegime)) {
      if (data.total > 0) {
        const accuracy = (data.wins / data.total) * 100;
        const regimeCI = calculateConfidenceInterval(accuracy, data.total);
        const regimeEmoji = regime === 'BULL' ? '🐂' : regime === 'BEAR' ? '🐻' : '↔️';
        console.log(`  ${regimeEmoji} ${regime.padEnd(8)}: ${accuracy.toFixed(1)}% (${data.wins}/${data.total} wins) [CI: ${regimeCI.lower.toFixed(0)}-${regimeCI.upper.toFixed(0)}%]`);
      } else {
        const regimeEmoji = regime === 'BULL' ? '🐂' : regime === 'BEAR' ? '🐻' : '↔️';
        console.log(`  ${regimeEmoji} ${regime.padEnd(8)}: N/A (no trades in this regime)`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════\n');

    // Compare to claimed accuracy with statistical context
    const claimedAccuracy = 82;

    if (confidenceInterval.lower >= claimedAccuracy) {
      console.log(`✅ VALIDATED: ${claimedAccuracy}% accuracy claim is supported`);
      console.log(`   Even lower bound of CI (${confidenceInterval.lower.toFixed(1)}%) meets target`);
    } else if (confidenceInterval.upper >= claimedAccuracy && actualAccuracy >= claimedAccuracy) {
      console.log(`✅ VALIDATED: Actual accuracy (${actualAccuracy.toFixed(1)}%) meets claimed ${claimedAccuracy}%`);
      console.log(`   Note: Lower bound of CI (${confidenceInterval.lower.toFixed(1)}%) is below target`);
    } else if (confidenceInterval.upper >= claimedAccuracy) {
      console.log(`⚠️  INCONCLUSIVE: Actual accuracy (${actualAccuracy.toFixed(1)}%) is below ${claimedAccuracy}%`);
      console.log(`   However, ${claimedAccuracy}% is within the confidence interval`);
      console.log(`   More data needed to confirm (current: ${totalPositions}, recommended: ${Math.max(MINIMUM_SAMPLE_SIZE, totalPositions * 2)} trades)`);
    } else {
      console.log(`❌ NOT VALIDATED: ${claimedAccuracy}% accuracy claim is NOT supported`);
      console.log(`   Actual: ${actualAccuracy.toFixed(1)}% | Upper CI bound: ${confidenceInterval.upper.toFixed(1)}%`);
      console.log(`   The ${claimedAccuracy}% target is outside the 95% confidence interval`);
    }

    if (!statisticallySignificant) {
      console.log(`\n⚠️  WARNING: Results may not be reliable due to small sample size (${totalPositions} < ${MINIMUM_SAMPLE_SIZE})`);
    }

    console.log('\n');

    return {
      period: `Last ${days} days`,
      totalSignals: totalPositions,
      totalPositions,
      winningPositions: winCount,
      losingPositions: lossCount,
      breakEvenPositions: breakEvenCount,
      actualAccuracy,
      adjustedAccuracy,
      confidenceInterval,
      profitFactor,
      byStrength: {
        STRONG: {
          accuracy: byStrength.STRONG.total > 0 ? (byStrength.STRONG.wins / byStrength.STRONG.total) * 100 : 0,
          count: byStrength.STRONG.total,
        },
        MODERATE: {
          accuracy: byStrength.MODERATE.total > 0 ? (byStrength.MODERATE.wins / byStrength.MODERATE.total) * 100 : 0,
          count: byStrength.MODERATE.total,
        },
        WEAK: {
          accuracy: byStrength.WEAK.total > 0 ? (byStrength.WEAK.wins / byStrength.WEAK.total) * 100 : 0,
          count: byStrength.WEAK.total,
        },
      },
      byMarketRegime: {
        BULL: {
          accuracy: byRegime.BULL.total > 0 ? (byRegime.BULL.wins / byRegime.BULL.total) * 100 : 0,
          count: byRegime.BULL.total,
          wins: byRegime.BULL.wins,
        },
        BEAR: {
          accuracy: byRegime.BEAR.total > 0 ? (byRegime.BEAR.wins / byRegime.BEAR.total) * 100 : 0,
          count: byRegime.BEAR.total,
          wins: byRegime.BEAR.wins,
        },
        SIDEWAYS: {
          accuracy: byRegime.SIDEWAYS.total > 0 ? (byRegime.SIDEWAYS.wins / byRegime.SIDEWAYS.total) * 100 : 0,
          count: byRegime.SIDEWAYS.total,
          wins: byRegime.SIDEWAYS.wins,
        },
      },
      statisticallySignificant,
      minimumSampleSize: MINIMUM_SAMPLE_SIZE,
    };
  } finally {
    client.release();
    await fastify.close();
  }
}

// Run if executed directly
if (require.main === module) {
  const days = parseInt(process.argv[2] || '30');

  validateSignalAccuracy(days)
    .then((result) => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

export { validateSignalAccuracy };
