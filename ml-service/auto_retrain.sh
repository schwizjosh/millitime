#!/bin/bash
# Automated ML Model Retraining Scheduler
# This script should be run via cron weekly or triggered by performance monitoring

set -e  # Exit on error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${SCRIPT_DIR}/venv/bin/python3"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/auto_retrain_$(date +%Y%m%d_%H%M%S).log"
MODEL_DIR="${SCRIPT_DIR}/models"
METADATA_FILE="${MODEL_DIR}/model_metadata.json"

# Training parameters
TRAINING_DAYS=90  # Train on last 90 days
MIN_POSITIONS=50  # Minimum positions required for training

# Create log directory
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "ML Auto-Retraining Started"
log "=========================================="

# Check if Python venv exists
if [ ! -f "$PYTHON" ]; then
    log "⚠️  Python venv not found at $PYTHON"
    log "   Using system python3"
    PYTHON="python3"
fi

# Check if we have enough data
log "📊 Checking available training data..."

# Query database for position count (requires psycopg2)
POSITION_COUNT=$(${PYTHON} -c "
import os
import psycopg2
from datetime import datetime, timedelta

db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/millitime')
conn = psycopg2.connect(db_url)
cursor = conn.cursor()

start_date = datetime.now() - timedelta(days=${TRAINING_DAYS})
cursor.execute(
    'SELECT COUNT(*) FROM trading_positions WHERE status IN (%s, %s) AND opened_at >= %s',
    ('CLOSED', 'EXPIRED', start_date)
)
count = cursor.fetchone()[0]
cursor.close()
conn.close()
print(count)
" 2>/dev/null || echo "0")

log "   Found $POSITION_COUNT closed positions in last $TRAINING_DAYS days"

# Check if we have minimum data
if [ "$POSITION_COUNT" -lt "$MIN_POSITIONS" ]; then
    log "⚠️  Not enough data for training (need $MIN_POSITIONS, have $POSITION_COUNT)"
    log "   Skipping retraining. Will retry next scheduled run."
    exit 0
fi

# Check when model was last trained
SHOULD_TRAIN=1

if [ -f "$METADATA_FILE" ]; then
    LAST_TRAINED=$(${PYTHON} -c "
import json
from datetime import datetime

with open('${METADATA_FILE}', 'r') as f:
    metadata = json.load(f)
    last_trained = metadata.get('trained_at', '2000-01-01T00:00:00')
    print(last_trained)
" 2>/dev/null || echo "2000-01-01T00:00:00")

    # Calculate days since last training
    DAYS_SINCE=$(${PYTHON} -c "
from datetime import datetime
last_trained = datetime.fromisoformat('${LAST_TRAINED}'.replace('Z', '+00:00'))
days = (datetime.now() - last_trained).days
print(days)
" 2>/dev/null || echo "999")

    log "   Last trained: $LAST_TRAINED ($DAYS_SINCE days ago)"

    # Don't retrain if trained within last 5 days (unless forced)
    if [ "$DAYS_SINCE" -lt 5 ] && [ "${FORCE_RETRAIN:-0}" != "1" ]; then
        log "   Model was recently trained. Skipping."
        SHOULD_TRAIN=0
    fi
fi

if [ "$SHOULD_TRAIN" -eq 0 ]; then
    log "✅ No retraining needed at this time"
    exit 0
fi

# Run training
log "🚀 Starting model training..."
log "   Training on last $TRAINING_DAYS days ($POSITION_COUNT positions)"

cd "$SCRIPT_DIR"

if ${PYTHON} train_model.py $TRAINING_DAYS >> "$LOG_FILE" 2>&1; then
    log "✅ Training completed successfully!"

    # Get model performance from metadata
    if [ -f "$METADATA_FILE" ]; then
        ACCURACY=$(${PYTHON} -c "
import json
with open('${METADATA_FILE}', 'r') as f:
    metadata = json.load(f)
    print(f\"{metadata.get('test_accuracy', 0):.2f}%\")
" 2>/dev/null || echo "N/A")

        log "   Test Accuracy: $ACCURACY"
    fi

    # Clean up old logs (keep last 30 days)
    find "$LOG_DIR" -name "auto_retrain_*.log" -mtime +30 -delete 2>/dev/null || true
    log "   Cleaned up old logs"

else
    log "❌ Training failed! Check logs for details."
    exit 1
fi

log "=========================================="
log "ML Auto-Retraining Completed"
log "=========================================="

exit 0
