/**
 * Signal Accuracy Validation Script
 * Analyzes historical signals and positions to validate accuracy claims
 *
 * QUICK WIN #3: Validate 82% accuracy claim
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import postgres from '@fastify/postgres';

interface ValidationResult {
  period: string;
  totalSignals: number;
  totalPositions: number;
  winningPositions: number;
  losingPositions: number;
  breakEvenPositions: number;
  actualAccuracy: number;
  profitFactor: number;
  byStrength: {
    STRONG: { accuracy: number; count: number };
    MODERATE: { accuracy: number; count: number };
    WEAK: { accuracy: number; count: number };
  };
}

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

    // Get all closed positions with their signals
    const result = await client.query(
      `SELECT
        p.id,
        p.coin_symbol,
        p.position as position_type,
        p.entry_price,
        p.current_price as exit_price,
        p.pnl_percent,
        p.pnl_usd,
        p.status,
        p.exit_reason,
        s.strength,
        s.signal_type,
        s.indicators
      FROM trading_positions p
      JOIN signals s ON p.signal_id = s.id
      WHERE p.status IN ('CLOSED', 'EXPIRED')
        AND p.opened_at >= $1
      ORDER BY p.opened_at DESC`,
      [startDate]
    );

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
        profitFactor: 0,
        byStrength: {
          STRONG: { accuracy: 0, count: 0 },
          MODERATE: { accuracy: 0, count: 0 },
          WEAK: { accuracy: 0, count: 0 },
        },
      };
    }

    // Analyze results
    const byStrength: Record<string, { wins: number; total: number }> = {
      STRONG: { wins: 0, total: 0 },
      MODERATE: { wins: 0, total: 0 },
      WEAK: { wins: 0, total: 0 },
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
    }

    const totalPositions = result.rows.length;
    const actualAccuracy = (winCount / totalPositions) * 100;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    // Print detailed results
    console.log('═══════════════════════════════════════════');
    console.log('         SIGNAL ACCURACY VALIDATION        ');
    console.log('═══════════════════════════════════════════\n');

    console.log('OVERALL PERFORMANCE:');
    console.log(`  Total Positions: ${totalPositions}`);
    console.log(`  Winning: ${winCount} (${((winCount / totalPositions) * 100).toFixed(1)}%)`);
    console.log(`  Losing: ${lossCount} (${((lossCount / totalPositions) * 100).toFixed(1)}%)`);
    console.log(`  Break-even: ${breakEvenCount} (${((breakEvenCount / totalPositions) * 100).toFixed(1)}%)`);
    console.log(`  \n  📈 Actual Accuracy: ${actualAccuracy.toFixed(2)}%`);
    console.log(`  💰 Profit Factor: ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}\n`);

    console.log('BY SIGNAL STRENGTH:');
    for (const [strength, data] of Object.entries(byStrength)) {
      if (data.total > 0) {
        const accuracy = (data.wins / data.total) * 100;
        console.log(`  ${strength.padEnd(10)}: ${accuracy.toFixed(1)}% (${data.wins}/${data.total} wins)`);
      } else {
        console.log(`  ${strength.padEnd(10)}: N/A (no trades)`);
      }
    }

    console.log('\n═══════════════════════════════════════════\n');

    // Compare to claimed accuracy
    const claimedAccuracy = 82;
    const difference = actualAccuracy - claimedAccuracy;

    if (actualAccuracy >= claimedAccuracy) {
      console.log(`✅ VALIDATED: Actual accuracy (${actualAccuracy.toFixed(1)}%) meets or exceeds claimed ${claimedAccuracy}%`);
    } else {
      console.log(`⚠️  BELOW TARGET: Actual accuracy (${actualAccuracy.toFixed(1)}%) is ${Math.abs(difference).toFixed(1)}% below claimed ${claimedAccuracy}%`);
      console.log(`   Note: Sample size (${totalPositions} trades) may be too small for statistical significance.`);
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
