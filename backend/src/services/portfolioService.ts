/**
 * Portfolio Service
 * Manages user cryptocurrency holdings (the "bag")
 */

import { Pool } from 'pg';
import { Portfolio, TradeHistory, UserSettings } from '../types/index.js';

export interface PortfolioWithCurrentValue extends Portfolio {
  current_price: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percentage: number;
}

export class PortfolioService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get or create user settings
   */
  async getUserSettings(userId: number): Promise<UserSettings> {
    let result = await this.pool.query<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      result = await this.pool.query<UserSettings>(
        `INSERT INTO user_settings (user_id, initial_balance, current_balance)
         VALUES ($1, 10000.00, 10000.00)
         RETURNING *`,
        [userId]
      );
    }

    return result.rows[0];
  }

  /**
   * Update user settings
   */
  async updateUserSettings(userId: number, settings: Partial<UserSettings>): Promise<UserSettings> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (settings.preferred_ai_provider !== undefined) {
      updateFields.push(`preferred_ai_provider = $${paramCount++}`);
      values.push(settings.preferred_ai_provider);
    }
    if (settings.show_token_costs !== undefined) {
      updateFields.push(`show_token_costs = $${paramCount++}`);
      values.push(settings.show_token_costs);
    }
    if (settings.auto_generate_actions !== undefined) {
      updateFields.push(`auto_generate_actions = $${paramCount++}`);
      values.push(settings.auto_generate_actions);
    }

    if (updateFields.length === 0) {
      return this.getUserSettings(userId);
    }

    values.push(userId);

    const result = await this.pool.query<UserSettings>(
      `UPDATE user_settings
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Get user portfolio holdings
   */
  async getUserPortfolio(userId: number): Promise<Portfolio[]> {
    const result = await this.pool.query<Portfolio>(
      'SELECT * FROM portfolio WHERE user_id = $1 ORDER BY total_invested DESC',
      [userId]
    );

    return result.rows;
  }

  /**
   * Get portfolio with current market values
   */
  async getUserPortfolioWithValues(userId: number, currentPrices: Record<string, number>): Promise<PortfolioWithCurrentValue[]> {
    const portfolio = await this.getUserPortfolio(userId);

    return portfolio.map(holding => {
      const currentPrice = currentPrices[holding.coin_id] || 0;
      const currentValue = holding.quantity * currentPrice;
      const profitLoss = currentValue - holding.total_invested;
      const profitLossPercentage = holding.total_invested > 0
        ? (profitLoss / holding.total_invested) * 100
        : 0;

      return {
        ...holding,
        current_price: currentPrice,
        current_value: currentValue,
        profit_loss: profitLoss,
        profit_loss_percentage: profitLossPercentage,
      };
    });
  }

  /**
   * Get or create portfolio holding
   */
  async getOrCreateHolding(userId: number, coinId: string, coinSymbol: string, coinName: string): Promise<Portfolio> {
    let result = await this.pool.query<Portfolio>(
      'SELECT * FROM portfolio WHERE user_id = $1 AND coin_id = $2',
      [userId, coinId]
    );

    if (result.rows.length === 0) {
      result = await this.pool.query<Portfolio>(
        `INSERT INTO portfolio (user_id, coin_id, coin_symbol, coin_name, quantity, average_buy_price, total_invested)
         VALUES ($1, $2, $3, $4, 0, 0, 0)
         RETURNING *`,
        [userId, coinId, coinSymbol, coinName]
      );
    }

    return result.rows[0];
  }

  /**
   * Update portfolio after buy
   */
  async updateAfterBuy(userId: number, coinId: string, coinSymbol: string, coinName: string, quantity: number, price: number, totalCost: number): Promise<Portfolio> {
    const holding = await this.getOrCreateHolding(userId, coinId, coinSymbol, coinName);

    const newQuantity = holding.quantity + quantity;
    const newTotalInvested = holding.total_invested + totalCost;
    const newAverageBuyPrice = newQuantity > 0 ? newTotalInvested / newQuantity : 0;

    const result = await this.pool.query<Portfolio>(
      `UPDATE portfolio
       SET quantity = $1, average_buy_price = $2, total_invested = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $4 AND coin_id = $5
       RETURNING *`,
      [newQuantity, newAverageBuyPrice, newTotalInvested, userId, coinId]
    );

    return result.rows[0];
  }

  /**
   * Update portfolio after sell
   */
  async updateAfterSell(userId: number, coinId: string, quantity: number, price: number, totalValue: number): Promise<Portfolio> {
    const holding = await this.pool.query<Portfolio>(
      'SELECT * FROM portfolio WHERE user_id = $1 AND coin_id = $2',
      [userId, coinId]
    );

    if (holding.rows.length === 0) {
      throw new Error('Holding not found');
    }

    const current = holding.rows[0];

    if (current.quantity < quantity) {
      throw new Error('Insufficient holdings to sell');
    }

    const newQuantity = current.quantity - quantity;
    const proportionSold = quantity / current.quantity;
    const newTotalInvested = current.total_invested * (1 - proportionSold);

    const result = await this.pool.query<Portfolio>(
      `UPDATE portfolio
       SET quantity = $1, total_invested = $2, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $3 AND coin_id = $4
       RETURNING *`,
      [newQuantity, newTotalInvested, userId, coinId]
    );

    return result.rows[0];
  }

  /**
   * Execute a buy trade
   */
  async executeBuy(userId: number, coinId: string, coinSymbol: string, coinName: string, quantity: number, price: number, fee: number = 0): Promise<{ trade: TradeHistory; portfolio: Portfolio; settings: UserSettings }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const totalCost = (quantity * price) + fee;

      // Check user balance
      const settingsResult = await client.query<UserSettings>(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rows.length === 0) {
        throw new Error('User settings not found');
      }

      const settings = settingsResult.rows[0];

      if (settings.current_balance < totalCost) {
        throw new Error('Insufficient balance');
      }

      // Update balance
      const newBalance = settings.current_balance - totalCost;
      await client.query(
        'UPDATE user_settings SET current_balance = $1 WHERE user_id = $2',
        [newBalance, userId]
      );

      // Record trade
      const tradeResult = await client.query<TradeHistory>(
        `INSERT INTO trade_history
          (user_id, trade_type, to_coin_id, to_coin_symbol, to_quantity, price, total_value, fee, status)
         VALUES ($1, 'BUY', $2, $3, $4, $5, $6, $7, 'COMPLETED')
         RETURNING *`,
        [userId, coinId, coinSymbol, quantity, price, totalCost, fee]
      );

      // Update portfolio
      const holding = await this.getOrCreateHolding(userId, coinId, coinSymbol, coinName);
      const newQuantity = holding.quantity + quantity;
      const newTotalInvested = holding.total_invested + totalCost;
      const newAverageBuyPrice = newQuantity > 0 ? newTotalInvested / newQuantity : 0;

      const portfolioResult = await client.query<Portfolio>(
        `UPDATE portfolio
         SET quantity = $1, average_buy_price = $2, total_invested = $3, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4 AND coin_id = $5
         RETURNING *`,
        [newQuantity, newAverageBuyPrice, newTotalInvested, userId, coinId]
      );

      await client.query('COMMIT');

      const updatedSettings = await this.getUserSettings(userId);

      return {
        trade: tradeResult.rows[0],
        portfolio: portfolioResult.rows[0],
        settings: updatedSettings,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a sell trade
   */
  async executeSell(userId: number, coinId: string, coinSymbol: string, quantity: number, price: number, fee: number = 0): Promise<{ trade: TradeHistory; portfolio: Portfolio; settings: UserSettings }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const totalValue = (quantity * price) - fee;

      // Check holdings
      const holdingResult = await client.query<Portfolio>(
        'SELECT * FROM portfolio WHERE user_id = $1 AND coin_id = $2',
        [userId, coinId]
      );

      if (holdingResult.rows.length === 0) {
        throw new Error('No holdings found for this coin');
      }

      const holding = holdingResult.rows[0];

      if (holding.quantity < quantity) {
        throw new Error('Insufficient holdings to sell');
      }

      // Record trade
      const tradeResult = await client.query<TradeHistory>(
        `INSERT INTO trade_history
          (user_id, trade_type, from_coin_id, from_coin_symbol, from_quantity, to_coin_id, to_coin_symbol, to_quantity, price, total_value, fee, status)
         VALUES ($1, 'SELL', $2, $3, $4, 'USD', 'USD', $5, $6, $7, $8, 'COMPLETED')
         RETURNING *`,
        [userId, coinId, coinSymbol, quantity, totalValue, price, totalValue, fee]
      );

      // Update portfolio
      const newQuantity = holding.quantity - quantity;
      const proportionSold = quantity / holding.quantity;
      const newTotalInvested = holding.total_invested * (1 - proportionSold);

      const portfolioResult = await client.query<Portfolio>(
        `UPDATE portfolio
         SET quantity = $1, total_invested = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3 AND coin_id = $4
         RETURNING *`,
        [newQuantity, newTotalInvested, userId, coinId]
      );

      // Update balance
      await client.query(
        'UPDATE user_settings SET current_balance = current_balance + $1 WHERE user_id = $2',
        [totalValue, userId]
      );

      await client.query('COMMIT');

      const updatedSettings = await this.getUserSettings(userId);

      return {
        trade: tradeResult.rows[0],
        portfolio: portfolioResult.rows[0],
        settings: updatedSettings,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a swap trade (sell one coin to buy another)
   */
  async executeSwap(userId: number, fromCoinId: string, fromCoinSymbol: string, fromQuantity: number, toCoinId: string, toCoinSymbol: string, toCoinName: string, fromPrice: number, toPrice: number, fee: number = 0): Promise<{ trade: TradeHistory; fromPortfolio: Portfolio; toPortfolio: Portfolio }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const fromValue = fromQuantity * fromPrice;
      const toQuantity = (fromValue - fee) / toPrice;

      // Check holdings
      const holdingResult = await client.query<Portfolio>(
        'SELECT * FROM portfolio WHERE user_id = $1 AND coin_id = $2',
        [userId, fromCoinId]
      );

      if (holdingResult.rows.length === 0) {
        throw new Error('No holdings found for source coin');
      }

      const holding = holdingResult.rows[0];

      if (holding.quantity < fromQuantity) {
        throw new Error('Insufficient holdings to swap');
      }

      // Record trade
      const tradeResult = await client.query<TradeHistory>(
        `INSERT INTO trade_history
          (user_id, trade_type, from_coin_id, from_coin_symbol, from_quantity, to_coin_id, to_coin_symbol, to_quantity, price, total_value, fee, status)
         VALUES ($1, 'SWAP', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'COMPLETED')
         RETURNING *`,
        [userId, fromCoinId, fromCoinSymbol, fromQuantity, toCoinId, toCoinSymbol, toQuantity, toPrice, fromValue, fee]
      );

      // Update from portfolio (reduce)
      const newFromQuantity = holding.quantity - fromQuantity;
      const proportionSold = fromQuantity / holding.quantity;
      const newFromTotalInvested = holding.total_invested * (1 - proportionSold);

      const fromPortfolioResult = await client.query<Portfolio>(
        `UPDATE portfolio
         SET quantity = $1, total_invested = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3 AND coin_id = $4
         RETURNING *`,
        [newFromQuantity, newFromTotalInvested, userId, fromCoinId]
      );

      // Update to portfolio (add)
      const toHoldingResult = await client.query<Portfolio>(
        'SELECT * FROM portfolio WHERE user_id = $1 AND coin_id = $2',
        [userId, toCoinId]
      );

      let toPortfolioResult;

      if (toHoldingResult.rows.length === 0) {
        // Create new holding
        toPortfolioResult = await client.query<Portfolio>(
          `INSERT INTO portfolio (user_id, coin_id, coin_symbol, coin_name, quantity, average_buy_price, total_invested)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [userId, toCoinId, toCoinSymbol, toCoinName, toQuantity, toPrice, fromValue]
        );
      } else {
        // Update existing holding
        const toHolding = toHoldingResult.rows[0];
        const newToQuantity = toHolding.quantity + toQuantity;
        const newToTotalInvested = toHolding.total_invested + fromValue;
        const newToAverageBuyPrice = newToQuantity > 0 ? newToTotalInvested / newToQuantity : 0;

        toPortfolioResult = await client.query<Portfolio>(
          `UPDATE portfolio
           SET quantity = $1, average_buy_price = $2, total_invested = $3, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4 AND coin_id = $5
           RETURNING *`,
          [newToQuantity, newToAverageBuyPrice, newToTotalInvested, userId, toCoinId]
        );
      }

      await client.query('COMMIT');

      return {
        trade: tradeResult.rows[0],
        fromPortfolio: fromPortfolioResult.rows[0],
        toPortfolio: toPortfolioResult.rows[0],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get trade history for a user
   */
  async getUserTradeHistory(userId: number, limit: number = 50): Promise<TradeHistory[]> {
    const result = await this.pool.query<TradeHistory>(
      'SELECT * FROM trade_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get trade history for a specific coin
   */
  async getCoinTradeHistory(userId: number, coinId: string): Promise<TradeHistory[]> {
    const result = await this.pool.query<TradeHistory>(
      `SELECT * FROM trade_history
       WHERE user_id = $1 AND (to_coin_id = $2 OR from_coin_id = $2)
       ORDER BY created_at DESC`,
      [userId, coinId]
    );

    return result.rows;
  }

  /**
   * Get portfolio summary with totals
   */
  async getPortfolioSummary(userId: number, currentPrices: Record<string, number>): Promise<{
    holdings: PortfolioWithCurrentValue[];
    totalInvested: number;
    totalCurrentValue: number;
    totalProfitLoss: number;
    totalProfitLossPercentage: number;
    availableBalance: number;
  }> {
    const holdings = await this.getUserPortfolioWithValues(userId, currentPrices);
    const settings = await this.getUserSettings(userId);

    const totalInvested = holdings.reduce((sum, h) => sum + h.total_invested, 0);
    const totalCurrentValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
    const totalProfitLoss = totalCurrentValue - totalInvested;
    const totalProfitLossPercentage = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

    return {
      holdings,
      totalInvested,
      totalCurrentValue,
      totalProfitLoss,
      totalProfitLossPercentage,
      availableBalance: settings.current_balance,
    };
  }
}
