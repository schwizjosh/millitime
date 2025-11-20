#!/usr/bin/env python3
"""
Synthetic Training Data Generator
Generates training data from historical OHLCV data by simulating trading strategy
"""

import os
import sys
import json
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import requests
from typing import List, Dict, Tuple

class SyntheticDataGenerator:
    def __init__(self, db_connection_string: str = None):
        self.db_connection_string = db_connection_string or os.getenv(
            'DATABASE_URL',
            'postgresql://postgres:postgres@localhost:5432/millitime'
        )

    def fetch_historical_ohlcv(self, symbol: str, days: int = 180) -> pd.DataFrame:
        """
        Fetch historical OHLCV data from Binance
        Falls back to CryptoCompare if Binance fails
        """
        print(f"📥 Fetching {days} days of historical data for {symbol}...")

        # Try Binance first (free, no API key needed)
        try:
            binance_symbol = f"{symbol}USDT"
            interval = "1h"  # 1-hour candles
            limit = min(days * 24, 1000)  # Binance limit is 1000

            url = f"https://api.binance.com/api/v3/klines"
            params = {
                'symbol': binance_symbol,
                'interval': interval,
                'limit': limit
            }

            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Convert to DataFrame
            df = pd.DataFrame(data, columns=[
                'timestamp', 'open', 'high', 'low', 'close', 'volume',
                'close_time', 'quote_volume', 'trades', 'taker_buy_base',
                'taker_buy_quote', 'ignore'
            ])

            # Convert types
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = df[col].astype(float)

            # Keep only needed columns
            df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]

            print(f"   ✅ Fetched {len(df)} candles from Binance")
            return df

        except Exception as e:
            print(f"   ⚠️  Binance failed: {e}")
            print(f"   Trying CryptoCompare...")

            # Fallback to CryptoCompare
            try:
                url = "https://min-api.cryptocompare.com/data/v2/histohour"
                params = {
                    'fsym': symbol,
                    'tsym': 'USD',
                    'limit': min(days * 24, 2000)
                }

                response = requests.get(url, params=params, timeout=30)
                response.raise_for_status()
                data = response.json()['Data']['Data']

                df = pd.DataFrame(data)
                df['timestamp'] = pd.to_datetime(df['time'], unit='s')
                df = df.rename(columns={
                    'volumefrom': 'volume',
                    'volumeto': 'quote_volume'
                })
                df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]

                print(f"   ✅ Fetched {len(df)} candles from CryptoCompare")
                return df

            except Exception as e2:
                print(f"   ❌ CryptoCompare also failed: {e2}")
                raise Exception(f"Failed to fetch data for {symbol}")

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate technical indicators (matching our 42 features)"""
        print("🔧 Calculating technical indicators...")

        df = df.copy()

        # RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))

        # MACD
        ema12 = df['close'].ewm(span=12).mean()
        ema26 = df['close'].ewm(span=26).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']

        # Bollinger Bands
        sma20 = df['close'].rolling(window=20).mean()
        std20 = df['close'].rolling(window=20).std()
        df['bb_upper'] = sma20 + (std20 * 2)
        df['bb_lower'] = sma20 - (std20 * 2)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / sma20
        df['price_to_bb'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])

        # EMAs
        df['ema_9'] = df['close'].ewm(span=9).mean()
        df['ema_21'] = df['close'].ewm(span=21).mean()
        df['ema_50'] = df['close'].ewm(span=50).mean()

        # SMA
        df['sma_20'] = sma20

        # Volume
        df['volume_sma'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma']

        # ATR (Average True Range)
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = np.max(ranges, axis=1)
        df['atr'] = true_range.rolling(14).mean()

        # Price momentum
        df['price_momentum'] = (df['close'] - df['close'].shift(5)) / df['close'].shift(5) * 100

        # Range position
        df['range_position'] = (df['close'] - df['low']) / (df['high'] - df['low'])

        print(f"   ✅ Calculated {len([c for c in df.columns if c not in ['timestamp', 'open', 'high', 'low', 'close', 'volume']])} indicators")
        return df

    def generate_signals(self, df: pd.DataFrame) -> List[Dict]:
        """
        Generate trading signals based on confluence strategy
        This mimics the actual signal generation logic
        """
        print("🎯 Generating synthetic trading signals...")

        signals = []

        for i in range(100, len(df)):  # Start after 100 candles for indicator stability
            row = df.iloc[i]

            # Skip if indicators not ready
            if pd.isna(row['rsi']) or pd.isna(row['macd']):
                continue

            # Confluence scoring (simplified version of actual logic)
            confluence = 0
            signal_type = None

            # RSI signals
            if row['rsi'] < 30:
                confluence += 20
                signal_type = 'BUY'
            elif row['rsi'] > 70:
                confluence += 20
                signal_type = 'SELL'

            # MACD signals
            if row['macd_histogram'] > 0 and signal_type == 'BUY':
                confluence += 15
            elif row['macd_histogram'] < 0 and signal_type == 'SELL':
                confluence += 15

            # EMA alignment
            if row['ema_9'] > row['ema_21'] > row['ema_50'] and signal_type == 'BUY':
                confluence += 15
            elif row['ema_9'] < row['ema_21'] < row['ema_50'] and signal_type == 'SELL':
                confluence += 15

            # Bollinger Bands
            if row['price_to_bb'] < 0.2 and signal_type == 'BUY':
                confluence += 10
            elif row['price_to_bb'] > 0.8 and signal_type == 'SELL':
                confluence += 10

            # Volume confirmation
            if row['volume_ratio'] > 1.2:
                confluence += 10

            # Only keep signals with decent confluence
            if confluence >= 50 and signal_type:
                signals.append({
                    'index': i,
                    'timestamp': row['timestamp'],
                    'signal_type': signal_type,
                    'confluence': confluence,
                    'entry_price': row['close'],
                    'rsi': row['rsi'],
                    'macd': row['macd'],
                    'macd_histogram': row['macd_histogram'],
                    'ema_9': row['ema_9'],
                    'ema_21': row['ema_21'],
                    'ema_50': row['ema_50'],
                    'bb_width': row['bb_width'],
                    'atr': row['atr'],
                    'volume_ratio': row['volume_ratio'],
                    'price_momentum': row['price_momentum'],
                })

        print(f"   ✅ Generated {len(signals)} signals")
        return signals

    def simulate_trades(self, signals: List[Dict], df: pd.DataFrame) -> pd.DataFrame:
        """
        Simulate trades for each signal to determine WIN/LOSS
        Uses simplified SL/TP strategy
        """
        print("⚙️  Simulating trades...")

        trades = []

        for signal in signals:
            entry_idx = signal['index']
            entry_price = signal['entry_price']
            signal_type = signal['signal_type']

            # Calculate SL and TP (matching FuturesCalculator logic)
            atr = signal['atr']

            if signal_type == 'BUY':
                stop_loss = entry_price - (atr * 1.5)
                take_profit = entry_price + (atr * 3.0)  # 1:2 risk/reward
            else:  # SELL
                stop_loss = entry_price + (atr * 1.5)
                take_profit = entry_price - (atr * 3.0)

            # Simulate trade execution over next 100 candles (or until hit)
            outcome = 'TIME_EXPIRED'
            exit_price = entry_price
            exit_idx = min(entry_idx + 100, len(df) - 1)

            for i in range(entry_idx + 1, min(entry_idx + 100, len(df))):
                candle = df.iloc[i]

                if signal_type == 'BUY':
                    # Check TP hit
                    if candle['high'] >= take_profit:
                        outcome = 'TP_HIT'
                        exit_price = take_profit
                        exit_idx = i
                        break
                    # Check SL hit
                    if candle['low'] <= stop_loss:
                        outcome = 'SL_HIT'
                        exit_price = stop_loss
                        exit_idx = i
                        break
                else:  # SELL
                    # Check TP hit
                    if candle['low'] <= take_profit:
                        outcome = 'TP_HIT'
                        exit_price = take_profit
                        exit_idx = i
                        break
                    # Check SL hit
                    if candle['high'] >= stop_loss:
                        outcome = 'SL_HIT'
                        exit_price = stop_loss
                        exit_idx = i
                        break

            # If not hit, use final candle close
            if outcome == 'TIME_EXPIRED':
                exit_price = df.iloc[exit_idx]['close']

            # Calculate P/L
            if signal_type == 'BUY':
                pnl_percent = ((exit_price - entry_price) / entry_price) * 100
            else:
                pnl_percent = ((entry_price - exit_price) / entry_price) * 100

            # Determine outcome
            is_win = pnl_percent > 0.5

            # Extract features (matching train_model.py feature engineering)
            trade = {
                # Indicators
                'rsi': signal['rsi'],
                'macd': signal['macd'],
                'macd_histogram': signal['macd_histogram'],
                'ema_9': signal['ema_9'],
                'ema_21': signal['ema_21'],
                'ema_50': signal['ema_50'],
                'bb_width': signal['bb_width'],
                'atr': signal['atr'],
                'volume_ratio': signal['volume_ratio'],
                'price_momentum': signal['price_momentum'],

                # Signal characteristics
                'signal_type': signal_type,
                'confluence': signal['confluence'],

                # Outcome
                'pnl_percent': pnl_percent,
                'outcome': 'WIN' if is_win else 'LOSS',
                'exit_reason': outcome,
            }

            trades.append(trade)

        trades_df = pd.DataFrame(trades)

        # Calculate stats
        wins = len(trades_df[trades_df['outcome'] == 'WIN'])
        losses = len(trades_df[trades_df['outcome'] == 'LOSS'])
        win_rate = (wins / len(trades_df) * 100) if len(trades_df) > 0 else 0

        print(f"   ✅ Simulated {len(trades_df)} trades")
        print(f"   📊 Win Rate: {win_rate:.1f}% ({wins} wins, {losses} losses)")

        return trades_df

    def generate_dataset(self, coins: List[str] = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'],
                        days: int = 180) -> pd.DataFrame:
        """
        Generate complete synthetic training dataset from multiple coins
        """
        print(f"\n🚀 Generating synthetic training data...")
        print(f"   Coins: {', '.join(coins)}")
        print(f"   Lookback: {days} days\n")

        all_trades = []

        for coin in coins:
            try:
                print(f"\n{'='*60}")
                print(f"Processing {coin}...")
                print(f"{'='*60}")

                # Fetch OHLCV
                ohlcv = self.fetch_historical_ohlcv(coin, days)

                # Calculate indicators
                ohlcv_with_indicators = self.calculate_indicators(ohlcv)

                # Generate signals
                signals = self.generate_signals(ohlcv_with_indicators)

                # Simulate trades
                trades = self.simulate_trades(signals, ohlcv_with_indicators)
                trades['coin'] = coin

                all_trades.append(trades)

            except Exception as e:
                print(f"❌ Error processing {coin}: {e}")
                continue

        # Combine all trades
        if not all_trades:
            raise Exception("No training data generated!")

        combined = pd.concat(all_trades, ignore_index=True)

        print(f"\n{'='*60}")
        print(f"📊 FINAL DATASET STATS")
        print(f"{'='*60}")
        print(f"   Total trades: {len(combined)}")
        print(f"   Wins: {len(combined[combined['outcome'] == 'WIN'])} ({len(combined[combined['outcome'] == 'WIN']) / len(combined) * 100:.1f}%)")
        print(f"   Losses: {len(combined[combined['outcome'] == 'LOSS'])} ({len(combined[combined['outcome'] == 'LOSS']) / len(combined) * 100:.1f}%)")
        print(f"   Avg P/L: {combined['pnl_percent'].mean():.2f}%")
        print(f"   Coins: {combined['coin'].unique().tolist()}")

        return combined

    def save_dataset(self, df: pd.DataFrame, filename: str = 'synthetic_training_data.csv'):
        """Save dataset to CSV"""
        filepath = os.path.join(os.path.dirname(__file__), 'data', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        df.to_csv(filepath, index=False)
        print(f"\n💾 Saved dataset to: {filepath}")
        print(f"   Size: {os.path.getsize(filepath) / 1024:.1f} KB")

        return filepath

def main():
    """Main execution"""
    generator = SyntheticDataGenerator()

    # Generate dataset
    dataset = generator.generate_dataset(
        coins=['BTC', 'ETH', 'SOL', 'BNB', 'XRP'],
        days=180
    )

    # Save to CSV
    generator.save_dataset(dataset)

    print("\n✅ Synthetic data generation complete!")
    print("   Next: Run train_model.py with --synthetic flag to train on this data")

if __name__ == '__main__':
    main()
