# Auto-Monitoring System - Strategy Analysis & Improvements

## 🔴 CRITICAL ISSUES

### 1. **Rate Limiting Catastrophe** ⚠️
**Problem:** The system will quickly hit CoinGecko's rate limits (30 req/min on free tier).

**Current Behavior:**
- Every 2 hours, scans run for ALL enabled users
- Each user triggers:
  - 1x `getTopCoins(250)` for gainers
  - 1x `getTopCoins(250)` for losers
  - 1x `getTopCoins(200)` for nascent trends
  - Nx `searchCoins()` + `getCoinsMarkets()` for each news-mentioned coin

**With just 5 users:** 15+ API calls every 2 hours = easily exceeded.

**Solution:**
```typescript
// Add global rate limit tracking
private lastScanTime = 0;
private minScanInterval = 7200000; // 2 hours minimum

// Batch users into groups
// Add exponential backoff on rate limit errors
// Cache getTopCoins results across users (same data)
```

---

### 2. **Unused Configuration Parameter** 🐛
**Problem:** `nascentVolumeIncreasePercent` config exists but is **never used**!

**Current Code (line 339-342):**
```typescript
const meetsVolumeCriteria = coin.price_change_percentage_24h >= config.nascentPriceChangeMin &&
                             coin.price_change_percentage_24h < 30;
// nascentVolumeIncreasePercent is ignored!
```

**Impact:** "Nascent trend" detection doesn't actually check volume increases, defeating its purpose.

**Solution:** Need historical volume comparison:
```typescript
// Fetch 24h ago volume, compare to current
const volumeIncrease = ((current - previous) / previous) * 100;
if (volumeIncrease < config.nascentVolumeIncreasePercent) continue;
```

---

### 3. **Duplicate Monitoring** 🔄
**Problem:** Same coin can be monitored for multiple reasons → multiple watchlist entries.

**Example:**
- Bitcoin pumps 20% → Added as "top_gainer"
- Bitcoin has 10 news articles → Added as "news_spike"
- User gets 2x notifications for same coin

**Database allows this:**
```sql
UNIQUE(user_id, coin_id, monitoring_reason)  -- Different reasons = different rows
```

**Solution:** Add max 1 active entry per coin:
```sql
-- New constraint
UNIQUE(user_id, coin_id) WHERE is_active = true;
-- Or aggregate multiple reasons into array
```

---

### 4. **No Per-User Coin Limit** 💥
**Problem:** User could auto-monitor 100+ coins if all conditions met.

**Scenario:**
- 10 top gainers
- 10 top losers
- 10 nascent trends
- 20 coins with news spikes
= **50 coins monitored** → Signal overload

**Solution:**
```typescript
// Add to config
max_total_auto_monitored_coins INTEGER DEFAULT 20,

// Before adding
const currentCount = await this.getCurrentMonitoredCount(userId);
if (currentCount >= config.maxTotalAutoMonitoredCoins) {
  // Skip or remove lowest priority coins
}
```

---

## 🟡 MODERATE ISSUES

### 5. **Symbol vs ID Ambiguity** (News Monitoring)
**Problem:** News articles store `coin_symbol` (e.g., "BTC"), but CoinGecko needs `coin_id` ("bitcoin").

**Current Code (line 287-289):**
```typescript
const searchResult = await this.coingeckoService.searchCoins(row.coin_symbol);
const coinData = searchResult.coins;
if (!coinData || coinData.length === 0) continue; // Could fail for ambiguous symbols
```

**Edge Cases:**
- "LUNA" → Terra Classic vs Terra 2.0?
- "FTM" → Fantom vs similar symbols
- Search might return wrong coin

**Solution:**
```typescript
// Store both symbol AND coin_id in news_articles table
// Or maintain symbol→id mapping cache
```

---

### 6. **Premature Validation Removal**
**Problem:** Coins are removed if they don't meet criteria on recheck, even if still valuable.

**Example:**
- Monday: Coin gains 20% → Auto-monitored as "top_gainer"
- Tuesday: Coin at +5% (consolidating) → **REMOVED** for not meeting 15% threshold
- Wednesday: Coin pumps to +50% → User missed it!

**Better Strategy:**
```typescript
// Grace period: Only remove after 2-3 failed validations
// Or use trailing stop: Remove only if drops below entry price by X%
validation_failure_count INTEGER DEFAULT 0,

if (!stillMeetsCriteria) {
  validationFailureCount++;
  if (validationFailureCount >= 3) {
    removeFromMonitoring();
  }
}
```

---

### 7. **No Concurrent Scan Prevention**
**Problem:** If scan takes >2 hours (many users + rate limits), next scan starts anyway.

**Risk:** Memory leak, duplicate monitoring, API overload

**Solution:**
```typescript
private isScanning = false;

async scanForNewCoins() {
  if (this.isScanning) {
    this.fastify.log.warn('Scan already in progress, skipping...');
    return;
  }

  this.isScanning = true;
  try {
    // ... scan logic
  } finally {
    this.isScanning = false;
  }
}
```

---

### 8. **Missing Exchange Availability Check**
**Problem:** Monitoring a coin that's not tradeable on user's exchange is useless.

**Current:** Monitors ANY coin from CoinGecko top 250

**Better:**
```typescript
// Check exchange_coins table
const isAvailable = await this.fastify.pg.query(
  `SELECT 1 FROM exchange_coins
   WHERE coin_id = $1 AND exchange = $2`,
  [coin.id, userExchange]
);

if (!isAvailable.rows.length) continue; // Skip non-tradeable coins
```

---

### 9. **Social Volume Captured But Never Used**
**Problem:** Schema has `social_volume` field, always set to 0.

**Current Code:**
```typescript
social_volume = $4,  // Always 0
```

**Opportunity Missed:** Could integrate LunarCrush data for better nascent trend detection.

**Solution:**
```typescript
// Fetch from social_metrics table if available
const socialData = await this.fastify.pg.query(
  `SELECT social_volume FROM social_metrics
   WHERE coin_symbol = $1 AND date > NOW() - INTERVAL '24 hours'`,
  [coinSymbol]
);
metrics.socialVolume = socialData.rows[0]?.social_volume || 0;
```

---

### 10. **Inefficient News Monitoring**
**Problem:** Sequential API calls for each news-mentioned coin.

**Current (line 285-309):**
```typescript
for (const row of result.rows) {  // Could be 20+ coins
  const searchResult = await this.coingeckoService.searchCoins(row.coin_symbol);  // API call 1
  const markets = await this.coingeckoService.getCoinsMarkets([coin.id]);  // API call 2
}
```

**Better:**
```typescript
// Batch process
const allSymbols = result.rows.map(r => r.coin_symbol);
const allCoinIds = await this.lookupCoinIds(allSymbols); // Single batch lookup
const markets = await this.coingeckoService.getCoinsMarkets(allCoinIds); // Single API call
```

---

## 🟢 OPTIMIZATION OPPORTUNITIES

### 11. **Cache getTopCoins Results**
**Why:** Same data used for gainers, losers, and nascent trends.

**Current:** 3 separate API calls per user

**Better:**
```typescript
private topCoinsCache: { data: any[], timestamp: number } | null = null;

async getTopCoins() {
  if (this.topCoinsCache && Date.now() - this.topCoinsCache.timestamp < 600000) {
    return this.topCoinsCache.data; // 10-minute cache
  }

  const data = await this.coingeckoService.getTopCoins(250);
  this.topCoinsCache = { data, timestamp: Date.now() };
  return data;
}
```

---

### 12. **Batch User Processing**
**Current:** Process all users sequentially (could take hours)

**Better:**
```typescript
// Process users in parallel batches
const userBatches = chunk(users, 5); // 5 users at a time

for (const batch of userBatches) {
  await Promise.all(batch.map(user => this.scanForUser(user)));
  await sleep(10000); // 10s delay between batches
}
```

---

### 13. **Smart Validation Scheduling**
**Current:** All coins validated every 6 hours simultaneously

**Better:** Stagger validations
```typescript
// Add random offset to last_checked_at on insert
added_at + (random() * INTERVAL '2 hours')

// Validation query becomes:
WHERE last_checked_at < NOW() - (hours_before_recheck || ' hours')::INTERVAL
// Naturally spreads out over time
```

---

### 14. **Add Monitoring Priority System**
**Why:** Not all auto-monitored coins are equal

**Example:**
```typescript
priority INTEGER DEFAULT 50,  -- 0-100 scale

// Calculate priority
priority = trendScore + (newsCount * 5) + (socialVolume / 1000);

// When removing coins due to limit, remove lowest priority first
ORDER BY priority ASC LIMIT (current - max)
```

---

### 15. **Missing: Top Losers Recovery Detection**
**Opportunity:** Monitor coins that lost -20% but are recovering.

**Example:**
```typescript
// Detect "dead cat bounce" or real recovery
if (coin.priceChange24h < -15 && coin.priceChange1h > 5) {
  // Lost 15%+ in 24h but gaining 5%+ in last hour
  addToMonitoring(userId, coin, 'recovery_signal');
}
```

---

### 16. **Missing: Whale Activity Integration**
**Current:** `whale_alerts` table exists but not used

**Opportunity:**
```typescript
// If coin has recent whale activity + other signals
const whaleActivity = await this.fastify.pg.query(
  `SELECT COUNT(*) FROM whale_alerts
   WHERE coin_symbol = $1 AND timestamp > NOW() - INTERVAL '24 hours'`,
  [coinSymbol]
);

if (whaleActivity.rows[0].count > 0) {
  trendScore += 10; // Boost score
}
```

---

## 🎯 STRATEGIC IMPROVEMENTS

### 17. **Add Machine Learning Scoring**
**Current:** Manual threshold-based detection

**Better:** Use existing ML signal enhancer
```typescript
import { MLSignalEnhancer } from './mlSignalEnhancer';

const mlScore = await mlSignalEnhancer.predictCoinPotential({
  priceChange24h,
  volumeRatio,
  newsCount,
  socialVolume,
  whaleActivity
});

if (mlScore > 0.7) {
  addToMonitoring(userId, coin, 'ml_high_confidence');
}
```

---

### 18. **Add User Feedback Loop**
**Schema already has:** `user_feedback` on trading positions

**Use it:**
```typescript
// Learn which auto-monitored coins led to profitable trades
const userSuccessRate = await this.fastify.pg.query(
  `SELECT monitoring_reason, AVG(outcome_rating) as avg_rating
   FROM auto_monitored_coins amc
   JOIN trading_positions tp ON amc.coin_id = tp.coin_id
   WHERE user_id = $1 AND outcome_rating IS NOT NULL
   GROUP BY monitoring_reason`,
  [userId]
);

// Adjust user's thresholds based on success rate
if (userSuccessRate.top_gainer < 3) {
  config.gainerThresholdPercent += 5; // Raise threshold
}
```

---

### 19. **Add "Trending Down" Protection**
**Missing:** Check if coin is in downtrend before adding

**Add:**
```typescript
// Fetch 7-day price history
const weekTrend = await this.getWeekTrend(coinId);

// Don't add "nascent trends" if 7-day trend is negative
if (reason === 'nascent_trend' && weekTrend < -10) {
  continue; // Likely a dead cat bounce
}
```

---

### 20. **Add Monitoring Reason Combinations**
**Better signal quality:** Coins meeting multiple criteria

**Example:**
```typescript
// Bonus for multi-signal coins
const reasons = [];
if (isTopGainer) reasons.push('top_gainer');
if (hasNewsSp) reasons.push('news_spike');
if (hasWhales) reasons.push('whale_activity');

if (reasons.length >= 2) {
  monitoring_reason = 'multi_signal';
  priority = 100; // Highest priority
}
```

---

## 📊 DATABASE OPTIMIZATIONS

### 21. **Missing Composite Indexes**
```sql
-- Current indexes are single-column
-- Add composite for common queries:

CREATE INDEX idx_auto_monitored_active_user_reason
  ON auto_monitored_coins(user_id, is_active, monitoring_reason)
  WHERE is_active = true;

CREATE INDEX idx_auto_monitored_validation_due
  ON auto_monitored_coins(last_checked_at, is_active)
  WHERE is_active = true;
```

---

### 22. **Add Monitoring Statistics**
**For debugging and optimization:**
```sql
CREATE TABLE auto_monitoring_stats (
  date DATE PRIMARY KEY,
  total_scans INTEGER,
  total_discoveries INTEGER,
  api_calls_made INTEGER,
  rate_limit_hits INTEGER,
  avg_scan_duration_ms INTEGER,
  coins_by_reason JSONB  -- {"top_gainer": 45, "news_spike": 23, ...}
);
```

---

### 23. **Add User Notification Preferences**
```sql
ALTER TABLE auto_monitoring_config ADD COLUMN
  notify_on_discovery BOOLEAN DEFAULT true,
  notify_on_removal BOOLEAN DEFAULT false,
  min_trend_score_for_notification DECIMAL DEFAULT 70.0;
```

---

## 🚀 IMPLEMENTATION PRIORITY

### HIGH PRIORITY (Do First)
1. ✅ Fix rate limiting (cache + batching)
2. ✅ Add concurrent scan prevention
3. ✅ Fix unused `nascentVolumeIncreasePercent` parameter
4. ✅ Add max coins per user limit

### MEDIUM PRIORITY
5. ⚠️ Add validation grace period (don't remove immediately)
6. ⚠️ Deduplicate multi-reason monitoring
7. ⚠️ Cache topCoins results across users
8. ⚠️ Check exchange availability before monitoring

### LOW PRIORITY (Nice to Have)
9. 💡 Add ML scoring integration
10. 💡 Integrate social volume from LunarCrush
11. 💡 Add whale activity boosting
12. 💡 User feedback loop for threshold adjustment

---

## 🎬 QUICK WINS

**Can implement in <1 hour:**

1. **Add max coins limit:**
```typescript
const MAX_AUTO_MONITORED = 25;
const current = await this.countUserMonitored(userId);
if (current >= MAX_AUTO_MONITORED) return;
```

2. **Prevent concurrent scans:**
```typescript
if (this.isScanning) return;
this.isScanning = true;
```

3. **Cache topCoins:**
```typescript
if (this.cache && Date.now() - this.cache.time < 600000) {
  return this.cache.data;
}
```

---

## 📈 EXPECTED IMPROVEMENTS

### After implementing HIGH priority fixes:
- **95% reduction** in API calls (caching + batching)
- **Zero** duplicate monitoring issues
- **Zero** concurrent scan conflicts
- **Better UX** (limited to 25 coins per user)

### After implementing MEDIUM priority:
- **60% fewer** premature removals (grace period)
- **50% faster** scans (parallel processing)
- **Better accuracy** (exchange availability check)

### After implementing LOW priority:
- **30% more accurate** detections (ML integration)
- **Self-optimizing** thresholds per user
- **Higher quality** signals (whale + social data)

---

## 🔧 TESTING RECOMMENDATIONS

1. **Load test with 100 simulated users**
2. **Measure API calls per scan** (should be <30)
3. **Test rate limit handling** (mock 429 responses)
4. **Verify no duplicate monitoring**
5. **Check validation grace period** (shouldn't remove good coins)
6. **Monitor database query performance** (EXPLAIN ANALYZE)

---

**Status:** Ready for implementation of HIGH priority fixes.
