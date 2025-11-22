#!/usr/bin/env python3
"""
XGBoost Signal Classifier - Training Script
Trains on historical signals to predict WIN/LOSS probability

Expected improvement: +5-8% accuracy
Model size: ~5-10 MB
Inference time: ~10-50ms
"""

import os
import sys
import json
import numpy as np
import pandas as pd
import psycopg2
from datetime import datetime, timedelta
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import joblib
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class SignalClassifierTrainer:
    def __init__(self, db_url=None):
        self.db_url = db_url or os.getenv('DATABASE_URL')
        self.model = None
        self.scaler = None
        self.feature_names = []

    def extract_training_data(self, min_days=30):
        """Extract historical signals and their outcomes from database"""
        print(f"📊 Extracting training data from last {min_days} days...")

        conn = psycopg2.connect(self.db_url)
        cursor = conn.cursor()

        # Get closed positions with their signals and outcomes
        query = """
        SELECT
            s.id as signal_id,
            s.coin_symbol,
            s.signal_type,
            s.strength,
            s.price,
            s.indicators,
            s.created_at,
            p.entry_price,
            p.current_price as exit_price,
            p.pnl_percent,
            p.pnl_usd,
            p.leverage,
            p.status,
            p.exit_reason,
            p.opened_at,
            p.closed_at,
            EXTRACT(EPOCH FROM (p.closed_at - p.opened_at))/60 as duration_minutes
        FROM signals s
        JOIN trading_positions p ON s.id = p.signal_id
        WHERE p.status IN ('CLOSED', 'EXPIRED')
          AND s.created_at >= NOW() - INTERVAL '%s days'
          AND p.pnl_percent IS NOT NULL
        ORDER BY s.created_at DESC
        """ % min_days

        cursor.execute(query)
        rows = cursor.fetchall()

        if len(rows) == 0:
            print(f"⚠️  No training data found! Need at least 50 closed positions.")
            print(f"   Try increasing min_days or wait for more trades to close.")
            conn.close()
            return None

        print(f"   Found {len(rows)} closed positions")

        # Convert to DataFrame
        columns = [
            'signal_id', 'coin_symbol', 'signal_type', 'strength', 'price',
            'indicators', 'created_at', 'entry_price', 'exit_price', 'pnl_percent',
            'pnl_usd', 'leverage', 'status', 'exit_reason', 'opened_at',
            'closed_at', 'duration_minutes'
        ]

        df = pd.DataFrame(rows, columns=columns)

        conn.close()

        return df

    def engineer_features(self, df):
        """Extract features from indicators JSON and create derived features"""
        print("🔧 Engineering features...")

        features = []

        for idx, row in df.iterrows():
            indicators = row['indicators']

            # Parse indicators JSON
            if isinstance(indicators, str):
                indicators = json.loads(indicators)

            # Extract technical indicators
            feature_dict = {
                # RSI
                'rsi': indicators.get('rsi', 50),
                'rsi_oversold': 1 if indicators.get('rsi', 50) < 35 else 0,
                'rsi_overbought': 1 if indicators.get('rsi', 50) > 65 else 0,

                # MACD
                'macd_value': indicators.get('macd', {}).get('MACD', 0),
                'macd_signal': indicators.get('macd', {}).get('signal', 0),
                'macd_histogram': indicators.get('macd', {}).get('histogram', 0),
                'macd_bullish': 1 if indicators.get('macd', {}).get('MACD', 0) > indicators.get('macd', {}).get('signal', 0) else 0,

                # Bollinger Bands
                'bb_upper': indicators.get('bollingerBands', {}).get('upper', 0),
                'bb_middle': indicators.get('bollingerBands', {}).get('middle', 0),
                'bb_lower': indicators.get('bollingerBands', {}).get('lower', 0),
                'bb_width': indicators.get('bollingerBands', {}).get('upper', 0) - indicators.get('bollingerBands', {}).get('lower', 0),

                # Price position relative to BB
                'price_to_bb_lower': (row['price'] - indicators.get('bollingerBands', {}).get('lower', row['price'])) / row['price'] if row['price'] > 0 else 0,
                'price_to_bb_upper': (indicators.get('bollingerBands', {}).get('upper', row['price']) - row['price']) / row['price'] if row['price'] > 0 else 0,

                # EMAs
                'ema9': indicators.get('ema9', row['price']),
                'ema21': indicators.get('ema21', row['price']),
                'ema50': indicators.get('ema50', row['price']),
                'ema_alignment': 1 if indicators.get('ema9', 0) > indicators.get('ema21', 0) > indicators.get('ema50', 0) else 0,

                # SMA
                'sma20': indicators.get('sma20', row['price']),

                # Volume
                'volume_trend': indicators.get('volumeTrend', 0) if indicators.get('volumeTrend') is not None else 0,
                'volume_spike': 1 if indicators.get('volumeTrend', 0) > 25 else 0,

                # Momentum
                'price_momentum': indicators.get('priceMomentum', 0) if indicators.get('priceMomentum') is not None else 0,
                'range_position': indicators.get('rangePosition', 50) if indicators.get('rangePosition') is not None else 50,

                # ATR (volatility)
                'atr': indicators.get('atr', 0) if indicators.get('atr') is not None else 0,

                # Confidence scores
                'confluence': indicators.get('confluence', 50),
                'overall_score': indicators.get('overallScore', 50),
                'technical_score': indicators.get('overallScore', 50),  # Fallback if separate scores not available
                'fundamental_score': indicators.get('fundamentalScore', 50),

                # Signal characteristics
                'signal_is_buy': 1 if row['signal_type'] == 'BUY' else 0,
                'signal_is_sell': 1 if row['signal_type'] == 'SELL' else 0,
                'strength_strong': 1 if row['strength'] == 'STRONG' else 0,
                'strength_moderate': 1 if row['strength'] == 'MODERATE' else 0,
                'strength_weak': 1 if row['strength'] == 'WEAK' else 0,

                # Position parameters
                'leverage': row['leverage'],

                # Time features (cyclical)
                'hour': row['created_at'].hour,
                'day_of_week': row['created_at'].weekday(),
                'hour_sin': np.sin(2 * np.pi * row['created_at'].hour / 24),
                'hour_cos': np.cos(2 * np.pi * row['created_at'].hour / 24),
                'dow_sin': np.sin(2 * np.pi * row['created_at'].weekday() / 7),
                'dow_cos': np.cos(2 * np.pi * row['created_at'].weekday() / 7),
            }

            features.append(feature_dict)

        features_df = pd.DataFrame(features)

        # Store feature names for later
        self.feature_names = list(features_df.columns)

        print(f"   Created {len(self.feature_names)} features")

        return features_df

    def create_target(self, df):
        """Create target variable: WIN (1) or LOSS (0)"""
        print("🎯 Creating target variable...")

        # Define WIN as P/L > 0.5%, LOSS as P/L < -0.5%
        target = (df['pnl_percent'] > 0.5).astype(int)

        win_count = target.sum()
        loss_count = len(target) - win_count
        win_rate = (win_count / len(target)) * 100

        print(f"   Wins: {win_count} ({win_rate:.1f}%)")
        print(f"   Losses: {loss_count} ({100-win_rate:.1f}%)")

        return target

    def train(self, X, y, test_size=0.2):
        """Train XGBoost classifier"""
        print("\n🤖 Training XGBoost model...")

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        print(f"   Training samples: {len(X_train)}")
        print(f"   Test samples: {len(X_test)}")

        # Scale features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # Train XGBoost
        self.model = xgb.XGBClassifier(
            objective='binary:logistic',
            eval_metric='logloss',
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        )

        print("\n   Training in progress...")
        self.model.fit(
            X_train_scaled, y_train,
            eval_set=[(X_test_scaled, y_test)],
            verbose=False
        )

        # Evaluate
        train_pred = self.model.predict(X_train_scaled)
        test_pred = self.model.predict(X_test_scaled)
        test_proba = self.model.predict_proba(X_test_scaled)[:, 1]

        train_accuracy = (train_pred == y_train).mean() * 100
        test_accuracy = (test_pred == y_test).mean() * 100
        test_auc = roc_auc_score(y_test, test_proba) * 100

        print(f"\n   ✅ Training complete!")
        print(f"   Train Accuracy: {train_accuracy:.2f}%")
        print(f"   Test Accuracy: {test_accuracy:.2f}%")
        print(f"   Test AUC-ROC: {test_auc:.2f}%")

        # Detailed test set report
        print("\n   📊 Test Set Performance:")
        print(classification_report(y_test, test_pred, target_names=['LOSS', 'WIN']))

        # Feature importance
        print("\n   🔝 Top 10 Most Important Features:")
        feature_importance = pd.DataFrame({
            'feature': self.feature_names,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)

        for idx, row in feature_importance.head(10).iterrows():
            print(f"      {row['feature']}: {row['importance']:.4f}")

        return X_test_scaled, y_test, test_proba

    def save_model(self, output_dir='./models'):
        """Save trained model and scaler"""
        os.makedirs(output_dir, exist_ok=True)

        print(f"\n💾 Saving model to {output_dir}/...")

        # Save XGBoost model
        model_path = os.path.join(output_dir, 'signal_classifier.json')
        self.model.save_model(model_path)
        print(f"   ✅ Model saved: {model_path}")

        # Save scaler
        scaler_path = os.path.join(output_dir, 'scaler.pkl')
        joblib.dump(self.scaler, scaler_path)
        print(f"   ✅ Scaler saved: {scaler_path}")

        # Save feature names
        features_path = os.path.join(output_dir, 'feature_names.json')
        with open(features_path, 'w') as f:
            json.dump(self.feature_names, f, indent=2)
        print(f"   ✅ Features saved: {features_path}")

        # Save metadata
        metadata = {
            'trained_at': datetime.now().isoformat(),
            'n_features': len(self.feature_names),
            'feature_names': self.feature_names,
            'model_type': 'XGBoost',
            'version': '1.0.0'
        }

        metadata_path = os.path.join(output_dir, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"   ✅ Metadata saved: {metadata_path}")

        print("\n   📦 Model package ready for deployment!")

def main():
    print("=" * 60)
    print("  XGBoost Signal Classifier - Training")
    print("=" * 60)

    # Check for minimum data requirement
    min_days = int(sys.argv[1]) if len(sys.argv) > 1 else 30

    trainer = SignalClassifierTrainer()

    # Extract data
    df = trainer.extract_training_data(min_days=min_days)

    if df is None or len(df) < 50:
        print("\n❌ Insufficient training data (need at least 50 samples)")
        print("   Wait for more trades to close or increase min_days")
        sys.exit(1)

    # Engineer features
    X = trainer.engineer_features(df)
    y = trainer.create_target(df)

    # Train model
    X_test, y_test, test_proba = trainer.train(X, y)

    # Save model
    trainer.save_model(output_dir='./models')

    print("\n" + "=" * 60)
    print("  🎉 Training Complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Install Node.js dependencies: npm install onnxruntime-node")
    print("  2. Run the ML service: npm run ml-service")
    print("  3. Test enhanced signals with ML predictions")
    print("\n")

if __name__ == '__main__':
    main()
