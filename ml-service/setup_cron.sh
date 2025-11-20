#!/bin/bash
# Setup cron job for automated ML retraining

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_RETRAIN_SCRIPT="${SCRIPT_DIR}/auto_retrain.sh"

echo "🔧 Setting up automated ML retraining cron job..."
echo ""

# Make scripts executable
chmod +x "$AUTO_RETRAIN_SCRIPT"
chmod +x "${SCRIPT_DIR}/generate_synthetic_data.py"
chmod +x "${SCRIPT_DIR}/train_model.py"

echo "✅ Made scripts executable"

# Check if cron job already exists
CRON_JOB="0 2 * * 0 cd ${SCRIPT_DIR} && ${AUTO_RETRAIN_SCRIPT} >> ${SCRIPT_DIR}/logs/cron.log 2>&1"
EXISTING=$(crontab -l 2>/dev/null | grep -F "auto_retrain.sh" || echo "")

if [ -n "$EXISTING" ]; then
    echo "⚠️  Cron job already exists:"
    echo "   $EXISTING"
    echo ""
    read -p "Replace existing cron job? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        exit 0
    fi

    # Remove existing
    crontab -l 2>/dev/null | grep -v "auto_retrain.sh" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job added successfully!"
echo ""
echo "📅 Schedule: Every Sunday at 2:00 AM"
echo "   Command: $CRON_JOB"
echo ""
echo "📋 To view cron jobs:"
echo "   crontab -l"
echo ""
echo "📋 To remove cron job:"
echo "   crontab -e"
echo ""
echo "📋 To manually trigger retraining:"
echo "   ${AUTO_RETRAIN_SCRIPT}"
echo ""
echo "📋 To force retraining (ignore recent training check):"
echo "   FORCE_RETRAIN=1 ${AUTO_RETRAIN_SCRIPT}"
echo ""
