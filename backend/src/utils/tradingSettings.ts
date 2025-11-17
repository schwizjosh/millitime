import { PoolClient } from 'pg';
import { TradingSettings } from '../types';

/**
 * Fetch trading settings for a set of users and return as a map keyed by user_id.
 */
export async function fetchTradingSettingsMap(
  client: PoolClient,
  userIds: number[]
): Promise<Map<number, TradingSettings>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const result = await client.query<TradingSettings>(
    `SELECT user_id, algo_enabled, run_in_background, whatsapp_number, whatsapp_api_key, updated_at
     FROM trading_settings
     WHERE user_id = ANY($1::int[])`,
    [userIds]
  );

  const settingsMap = new Map<number, TradingSettings>();
  for (const row of result.rows) {
    settingsMap.set(row.user_id, row);
  }

  return settingsMap;
}
