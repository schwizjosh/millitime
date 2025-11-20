/**
 * Position Tracker Service
 * Automated 15-minute scalp trade management
 * Tracks positions and sends timely exit recommendations
 */

import { FastifyInstance } from 'fastify';
import { sendWhatsAppNotification } from './whatsappNotifier';
import { coingeckoService } from './coingecko';

export interface ActivePosition {
  id: number;
  user_id: number;
  signal_id: number;
  coin_id: string;
  coin_symbol: string;
  position: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: number;
  current_price: number;
  stop_loss: number;
  take_profit: number;
  entry_time: Date;
  last_check: Date;
  last_update_sent: Date;
  check_in_15min_sent: boolean;
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
  pnl_usd?: number;
  pnl_percent?: number;
}

export interface PositionRecommendation {
  action: 'HOLD' | 'CLOSE_FULL' | 'CLOSE_PARTIAL' | 'TRAIL_STOP' | 'EXIT_URGENT';
  reason: string;
  suggested_sl?: number;
  close_percentage?: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export class PositionTrackerService {
  private fastify: FastifyInstance;
  private isRunning = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Start position tracking service
   * Runs every 5 minutes (same as signal generation)
   */
  async start() {
    if (this.isRunning) {
      this.fastify.log.info('Position tracker is already running');
      return;
    }

    this.isRunning = true;
    this.fastify.log.info('Position Tracker Service started - checking every 5 minutes');

    // Check positions every 5 minutes for rapid market monitoring
    setInterval(() => {
      this.checkAllPositions().catch((error) => {
        this.fastify.log.error({ error }, 'Error checking positions');
      });
    }, 5 * 60 * 1000); // 5 minutes

    // Initial check
    this.checkAllPositions().catch((error) => {
      this.fastify.log.error({ error }, 'Error in initial position check');
    });
  }

  /**
   * Create new active position when signal is generated
   */
  async createPosition(
    userId: number,
    signalId: number,
    coinId: string,
    coinSymbol: string,
    position: 'LONG' | 'SHORT',
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    leverage: number = 3
  ): Promise<number> {
    const client = await this.fastify.pg.connect();

    try {
      const result = await client.query(
        `INSERT INTO active_positions
         (user_id, signal_id, coin_id, coin_symbol, position, entry_price, current_price,
          stop_loss, take_profit, leverage, status, entry_time)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId, signalId, coinId, coinSymbol, position, entryPrice, stopLoss, takeProfit, leverage]
      );

      const positionId = result.rows[0].id;
      this.fastify.log.info(
        `📊 Created active position #${positionId}: ${position} ${coinSymbol} @ $${entryPrice} for user ${userId}`
      );

      return positionId;
    } finally {
      client.release();
    }
  }

  /**
   * Check all active positions and send recommendations
   */
  async checkAllPositions(): Promise<void> {
    const client = await this.fastify.pg.connect();

    try {
      // Get all active positions
      const result = await client.query<ActivePosition>(
        `SELECT * FROM active_positions
         WHERE status = 'ACTIVE'
         ORDER BY entry_time ASC`
      );

      if (result.rows.length === 0) {
        this.fastify.log.debug('No active positions to check');
        return;
      }

      this.fastify.log.info(`Checking ${result.rows.length} active positions`);

      for (const position of result.rows) {
        await this.checkPosition(position, client);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Check individual position and send recommendations
   */
  private async checkPosition(position: ActivePosition, client: any): Promise<void> {
    const now = new Date();
    const entryTime = new Date(position.entry_time);
    const minutesElapsed = (now.getTime() - entryTime.getTime()) / (1000 * 60);

    // Get current price
    const currentPrice = await this.getCurrentPrice(position.coin_id);
    if (!currentPrice) {
      this.fastify.log.warn(`Could not get current price for ${position.coin_symbol}`);
      return;
    }

    // Calculate P/L
    const pnl = this.calculatePnL(
      position.entry_price,
      currentPrice,
      position.position,
      position.leverage
    );

    // Update current price
    await client.query(
      `UPDATE active_positions
       SET current_price = $1, last_check = CURRENT_TIMESTAMP, pnl_usd = $2, pnl_percent = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [currentPrice, pnl.usd, pnl.percent, position.id]
    );

    // Get trading settings for user
    const settingsResult = await client.query(
      'SELECT whatsapp_number, whatsapp_api_key, run_in_background FROM trading_settings WHERE user_id = $1',
      [position.user_id]
    );

    const settings = settingsResult.rows[0];
    if (!settings || !settings.whatsapp_number || !settings.run_in_background) {
      return; // User doesn't have WhatsApp notifications enabled
    }

    // Determine recommendation
    const recommendation = this.analyzePosition(position, currentPrice, pnl, minutesElapsed);

    // Send 15-minute check-in (only once)
    if (minutesElapsed >= 15 && !position.check_in_15min_sent) {
      await this.send15MinCheckIn(position, currentPrice, pnl, recommendation, settings);

      await client.query(
        'UPDATE active_positions SET check_in_15min_sent = TRUE, last_update_sent = CURRENT_TIMESTAMP WHERE id = $1',
        [position.id]
      );
    }

    // Send urgent updates regardless of 15-min mark
    if (recommendation.urgency === 'URGENT') {
      // Check if we sent update recently (don't spam)
      const lastUpdate = position.last_update_sent ? new Date(position.last_update_sent) : null;
      const minutesSinceLastUpdate = lastUpdate
        ? (now.getTime() - lastUpdate.getTime()) / (1000 * 60)
        : 999;

      if (minutesSinceLastUpdate > 2) {
        // Only send if more than 2 min since last update
        await this.sendUrgentUpdate(position, currentPrice, pnl, recommendation, settings);

        await client.query(
          'UPDATE active_positions SET last_update_sent = CURRENT_TIMESTAMP WHERE id = $1',
          [position.id]
        );
      }
    }

    // Auto-close position after 30 minutes
    if (minutesElapsed >= 30 && position.status === 'ACTIVE') {
      await this.sendForceExitRecommendation(position, currentPrice, pnl, settings);

      await client.query(
        `UPDATE active_positions
         SET status = 'EXPIRED', exit_reason = 'TIME_EXPIRED', exit_time = CURRENT_TIMESTAMP, exit_price = $1
         WHERE id = $2`,
        [currentPrice, position.id]
      );

      this.fastify.log.info(
        `⏰ Position #${position.id} expired after 30 minutes (${position.coin_symbol})`
      );
    }
  }

  /**
   * Analyze position and determine recommendation
   */
  private analyzePosition(
    position: ActivePosition,
    currentPrice: number,
    pnl: { usd: number; percent: number },
    minutesElapsed: number
  ): PositionRecommendation {
    const tpDistance = Math.abs(currentPrice - position.take_profit);
    const totalMove = Math.abs(position.take_profit - position.entry_price);
    const progressToTP = ((totalMove - tpDistance) / totalMove) * 100;

    const slDistance = Math.abs(currentPrice - position.stop_loss);
    const totalRisk = Math.abs(position.entry_price - position.stop_loss);
    const distanceFromSL = (slDistance / totalRisk) * 100;

    // Scenario 1: TP HIT (100%+)
    if (progressToTP >= 100) {
      return {
        action: 'CLOSE_PARTIAL',
        reason: 'Take Profit target reached! Secure profits and trail remainder.',
        close_percentage: 70,
        suggested_sl: position.entry_price + (position.entry_price * 0.002), // Breakeven + 0.2%
        urgency: 'HIGH',
      };
    }

    // Scenario 2: Very close to TP (90%+)
    if (progressToTP >= 90) {
      const newSL =
        position.entry_price + (position.take_profit - position.entry_price) * 0.5; // Move SL halfway
      return {
        action: 'TRAIL_STOP',
        reason: `${progressToTP.toFixed(0)}% to TP! Trail stop to lock in profits.`,
        suggested_sl: newSL,
        urgency: 'MEDIUM',
      };
    }

    // Scenario 3: Approaching SL (< 20% distance)
    if (distanceFromSL < 20) {
      return {
        action: 'EXIT_URGENT',
        reason: 'Approaching stop loss! Consider exiting to minimize loss.',
        urgency: 'URGENT',
      };
    }

    // Scenario 4: Sideways at 15-min mark (< 0.3% movement)
    if (minutesElapsed >= 15 && Math.abs(pnl.percent) < 0.3) {
      return {
        action: 'CLOSE_FULL',
        reason: '15 minutes elapsed with minimal movement. Exit to preserve capital.',
        urgency: 'MEDIUM',
      };
    }

    // Scenario 5: Profitable and at 15-min mark (move to breakeven)
    if (minutesElapsed >= 15 && pnl.percent > 0.2 && progressToTP < 75) {
      return {
        action: 'TRAIL_STOP',
        reason: 'In profit. Move stop to breakeven to secure position.',
        suggested_sl: position.entry_price,
        urgency: 'MEDIUM',
      };
    }

    // Scenario 6: 50% to TP - move to breakeven
    if (progressToTP >= 50 && progressToTP < 75) {
      return {
        action: 'TRAIL_STOP',
        reason: 'Halfway to target. Move stop to breakeven.',
        suggested_sl: position.entry_price,
        urgency: 'LOW',
      };
    }

    // Default: HOLD
    return {
      action: 'HOLD',
      reason: 'Position progressing normally. Monitor for next update.',
      urgency: 'LOW',
    };
  }

  /**
   * Send 15-minute check-in message
   */
  private async send15MinCheckIn(
    position: ActivePosition,
    currentPrice: number,
    pnl: { usd: number; percent: number },
    recommendation: PositionRecommendation,
    settings: any
  ): Promise<void> {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'Africa/Cairo', // User timezone (WAT+1)
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const emoji = recommendation.action === 'CLOSE_FULL' || recommendation.action === 'EXIT_URGENT'
      ? '🔴'
      : recommendation.action === 'CLOSE_PARTIAL'
      ? '🎯'
      : recommendation.action === 'TRAIL_STOP'
      ? '📊'
      : '✅';

    let message = `${emoji} *15-MIN CHECK-IN*\n`;
    message += `⏰ ${timeStr}\n`;
    message += `━━━━━━━━━━━━━━━━\n\n`;

    message += `*${position.coin_symbol} ${position.position}* from $${position.entry_price.toFixed(2)}\n`;
    message += `Current: $${currentPrice.toFixed(2)} (${pnl.percent > 0 ? '+' : ''}${pnl.percent.toFixed(2)}%)\n`;
    message += `P/L: ${pnl.usd > 0 ? '+' : ''}$${pnl.usd.toFixed(2)}\n\n`;

    message += `📊 *STATUS*\n`;
    const tpDistance = Math.abs(currentPrice - position.take_profit);
    const totalMove = Math.abs(position.take_profit - position.entry_price);
    const progressToTP = ((totalMove - tpDistance) / totalMove) * 100;
    message += `Progress to TP: ${progressToTP.toFixed(0)}%\n`;
    message += `Distance from SL: ${currentPrice > position.stop_loss ? '+' : ''}$${(currentPrice - position.stop_loss).toFixed(2)}\n`;
    message += `Time elapsed: 15 minutes\n\n`;

    message += `${this.getActionEmoji(recommendation.action)} *RECOMMENDATION*\n`;
    message += `ACTION: ${this.getActionText(recommendation.action)}\n`;
    message += `REASON: ${recommendation.reason}\n`;

    if (recommendation.suggested_sl) {
      message += `MOVE SL TO: $${recommendation.suggested_sl.toFixed(2)}\n`;
    }

    if (recommendation.close_percentage) {
      message += `CLOSE: ${recommendation.close_percentage}% of position\n`;
    }

    message += `\n━━━━━━━━━━━━━━━━\n`;
    message += `_Millitime Position Tracker_`;

    await sendWhatsAppNotification(this.fastify, {
      phone: settings.whatsapp_number,
      message,
      apiKey: settings.whatsapp_api_key,
    });

    this.fastify.log.info(
      `📱 15-min check-in sent for position #${position.id} (${position.coin_symbol})`
    );
  }

  /**
   * Send urgent update (TP hit, SL approaching, etc.)
   */
  private async sendUrgentUpdate(
    position: ActivePosition,
    currentPrice: number,
    pnl: { usd: number; percent: number },
    recommendation: PositionRecommendation,
    settings: any
  ): Promise<void> {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    let message = `🚨 *URGENT UPDATE*\n`;
    message += `⏰ ${timeStr}\n`;
    message += `━━━━━━━━━━━━━━━━\n\n`;

    message += `*${position.coin_symbol} ${position.position}* from $${position.entry_price.toFixed(2)}\n`;
    message += `Current: $${currentPrice.toFixed(2)} (${pnl.percent > 0 ? '+' : ''}${pnl.percent.toFixed(2)}%)\n`;
    message += `P/L: ${pnl.usd > 0 ? '+' : ''}$${pnl.usd.toFixed(2)}\n\n`;

    message += `⚡ *URGENT ACTION NEEDED*\n`;
    message += `${recommendation.reason}\n\n`;

    message += `RECOMMENDED: ${this.getActionText(recommendation.action)}\n`;

    if (recommendation.suggested_sl) {
      message += `NEW SL: $${recommendation.suggested_sl.toFixed(2)}\n`;
    }

    message += `\n━━━━━━━━━━━━━━━━\n`;
    message += `_Act quickly on this update_`;

    await sendWhatsAppNotification(this.fastify, {
      phone: settings.whatsapp_number,
      message,
      apiKey: settings.whatsapp_api_key,
    });

    this.fastify.log.info(
      `🚨 Urgent update sent for position #${position.id} (${position.coin_symbol})`
    );
  }

  /**
   * Send 30-minute force exit recommendation
   */
  private async sendForceExitRecommendation(
    position: ActivePosition,
    currentPrice: number,
    pnl: { usd: number; percent: number },
    settings: any
  ): Promise<void> {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    let message = `⏰ *30-MIN AUTO-EXIT*\n`;
    message += `⏰ ${timeStr}\n`;
    message += `━━━━━━━━━━━━━━━━\n\n`;

    message += `*${position.coin_symbol} ${position.position}* from $${position.entry_price.toFixed(2)}\n`;
    message += `Current: $${currentPrice.toFixed(2)} (${pnl.percent > 0 ? '+' : ''}${pnl.percent.toFixed(2)}%)\n`;
    message += `P/L: ${pnl.usd > 0 ? '+' : ''}$${pnl.usd.toFixed(2)}\n\n`;

    message += `⏱️ *TIME LIMIT REACHED*\n`;
    message += `30 minutes elapsed - scalp trade window closed.\n\n`;

    message += `ACTION: Exit position now\n`;
    message += `REASON: Risk management - don't hold scalp trades too long\n\n`;

    message += `━━━━━━━━━━━━━━━━\n`;
    message += `_Position auto-closed by tracker_`;

    await sendWhatsAppNotification(this.fastify, {
      phone: settings.whatsapp_number,
      message,
      apiKey: settings.whatsapp_api_key,
    });

    this.fastify.log.info(
      `⏰ 30-min force exit sent for position #${position.id} (${position.coin_symbol})`
    );
  }

  /**
   * Get current price for a coin
   */
  private async getCurrentPrice(coinId: string): Promise<number | null> {
    try {
      const data = await coingeckoService.getSimplePrice([coinId]);
      return data?.[coinId]?.usd || null;
    } catch (error) {
      this.fastify.log.error({ error, coinId }, 'Error fetching current price');
      return null;
    }
  }

  /**
   * Calculate P/L for position
   */
  private calculatePnL(
    entryPrice: number,
    currentPrice: number,
    position: 'LONG' | 'SHORT',
    leverage: number
  ): { usd: number; percent: number } {
    let priceChange = currentPrice - entryPrice;

    if (position === 'SHORT') {
      priceChange = -priceChange; // Inverse for shorts
    }

    const percentChange = (priceChange / entryPrice) * 100;
    const leveragedPercent = percentChange * leverage;

    // Assume $1000 position size for example
    const positionSize = 1000;
    const pnlUsd = (positionSize * leveragedPercent) / 100;

    return {
      usd: pnlUsd,
      percent: leveragedPercent,
    };
  }

  /**
   * Get emoji for action
   */
  private getActionEmoji(action: PositionRecommendation['action']): string {
    switch (action) {
      case 'CLOSE_FULL':
        return '🔴';
      case 'CLOSE_PARTIAL':
        return '🎯';
      case 'TRAIL_STOP':
        return '📊';
      case 'EXIT_URGENT':
        return '🚨';
      case 'HOLD':
        return '✅';
      default:
        return '📌';
    }
  }

  /**
   * Get action text
   */
  private getActionText(action: PositionRecommendation['action']): string {
    switch (action) {
      case 'CLOSE_FULL':
        return 'Close entire position';
      case 'CLOSE_PARTIAL':
        return 'Take partial profits';
      case 'TRAIL_STOP':
        return 'Trail stop loss';
      case 'EXIT_URGENT':
        return 'EXIT IMMEDIATELY';
      case 'HOLD':
        return 'Hold position';
      default:
        return 'Monitor';
    }
  }
}
