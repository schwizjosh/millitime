/**
 * Gemini API Rate Limiter - Free Tier Protection
 *
 * Free Tier Limits (Gemini 2.5 Flash):
 * - 10 requests per minute (RPM)
 * - 250,000 tokens per minute (TPM)
 * - 250 requests per day (RPD)
 *
 * This service ensures we stay within free tier limits and automatically
 * falls back to other providers when limits are exceeded.
 */

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxRequestsPerDay: number;
  resetHourPST?: number; // Hour when daily limit resets (default: 0 = midnight PST)
}

export interface UsageStats {
  requestsThisMinute: number;
  tokensThisMinute: number;
  requestsToday: number;
  tokensToday: number;
  lastResetTime: Date;
  dailyResetTime: Date;
}

export class GeminiRateLimiter {
  private config: RateLimitConfig;
  private requestTimestamps: number[] = [];
  private tokenUsageByMinute: Map<number, number> = new Map();
  private dailyRequestCount: number = 0;
  private dailyTokenCount: number = 0;
  private lastDailyReset: Date;

  // Alert thresholds (percentage of limit)
  private readonly WARNING_THRESHOLD = 0.7; // 70%
  private readonly CRITICAL_THRESHOLD = 0.9; // 90%

  private warningCallbacks: Array<(stats: UsageStats) => void> = [];
  private criticalCallbacks: Array<(stats: UsageStats) => void> = [];
  private limitReachedCallbacks: Array<(limitType: string) => void> = [];

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequestsPerMinute: 10,
      maxTokensPerMinute: 250000,
      maxRequestsPerDay: 250,
      resetHourPST: 0, // Midnight PST
      ...config,
    };

    this.lastDailyReset = this.getNextResetTime();
    this.startDailyResetTimer();
  }

  /**
   * Get next daily reset time (midnight PST)
   */
  private getNextResetTime(): Date {
    const now = new Date();
    const pstOffset = -8; // PST is UTC-8

    // Convert current time to PST
    const pstTime = new Date(now.getTime() + (pstOffset * 60 * 60 * 1000));

    // Set to next midnight PST
    const nextReset = new Date(pstTime);
    nextReset.setHours(this.config.resetHourPST || 0, 0, 0, 0);

    // If we're past midnight today, move to tomorrow
    if (pstTime >= nextReset) {
      nextReset.setDate(nextReset.getDate() + 1);
    }

    // Convert back to local time
    return new Date(nextReset.getTime() - (pstOffset * 60 * 60 * 1000));
  }

  /**
   * Start timer to reset daily counters at midnight PST
   */
  private startDailyResetTimer(): void {
    const checkInterval = 60000; // Check every minute

    setInterval(() => {
      const now = new Date();
      if (now >= this.lastDailyReset) {
        console.log('🔄 Gemini rate limiter: Daily reset triggered');
        this.dailyRequestCount = 0;
        this.dailyTokenCount = 0;
        this.lastDailyReset = this.getNextResetTime();
      }
    }, checkInterval);
  }

  /**
   * Clean up old request timestamps (older than 1 minute)
   */
  private cleanupOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // Cleanup old token usage entries
    const currentMinute = Math.floor(Date.now() / 60000);
    for (const [minute, _] of this.tokenUsageByMinute.entries()) {
      if (minute < currentMinute - 1) {
        this.tokenUsageByMinute.delete(minute);
      }
    }
  }

  /**
   * Get current token usage in the last minute
   */
  private getCurrentMinuteTokens(): number {
    const currentMinute = Math.floor(Date.now() / 60000);
    return this.tokenUsageByMinute.get(currentMinute) || 0;
  }

  /**
   * Check if we can make a request without exceeding limits
   */
  canMakeRequest(estimatedTokens: number = 0): { allowed: boolean; reason?: string; stats: UsageStats } {
    this.cleanupOldTimestamps();

    const stats = this.getUsageStats();

    // Check daily request limit
    if (stats.requestsToday >= this.config.maxRequestsPerDay) {
      this.triggerLimitReached('daily_requests');
      return {
        allowed: false,
        reason: `Daily request limit reached (${this.config.maxRequestsPerDay}/day)`,
        stats,
      };
    }

    // Check requests per minute limit
    if (stats.requestsThisMinute >= this.config.maxRequestsPerMinute) {
      this.triggerLimitReached('rpm');
      return {
        allowed: false,
        reason: `Requests per minute limit reached (${this.config.maxRequestsPerMinute}/min)`,
        stats,
      };
    }

    // Check tokens per minute limit (if estimated)
    if (estimatedTokens > 0 && stats.tokensThisMinute + estimatedTokens > this.config.maxTokensPerMinute) {
      this.triggerLimitReached('tpm');
      return {
        allowed: false,
        reason: `Tokens per minute limit would be exceeded (${this.config.maxTokensPerMinute}/min)`,
        stats,
      };
    }

    // Check warning and critical thresholds
    this.checkThresholds(stats);

    return { allowed: true, stats };
  }

  /**
   * Record a successful request
   */
  recordRequest(tokensUsed: number): void {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);

    // Record request timestamp
    this.requestTimestamps.push(now);
    this.dailyRequestCount++;

    // Record token usage
    const currentTokens = this.tokenUsageByMinute.get(currentMinute) || 0;
    this.tokenUsageByMinute.set(currentMinute, currentTokens + tokensUsed);
    this.dailyTokenCount += tokensUsed;

    this.cleanupOldTimestamps();
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): UsageStats {
    this.cleanupOldTimestamps();

    return {
      requestsThisMinute: this.requestTimestamps.length,
      tokensThisMinute: this.getCurrentMinuteTokens(),
      requestsToday: this.dailyRequestCount,
      tokensToday: this.dailyTokenCount,
      lastResetTime: new Date(),
      dailyResetTime: this.lastDailyReset,
    };
  }

  /**
   * Get usage as percentage of limits
   */
  getUsagePercentages(): {
    rpm: number;
    tpm: number;
    rpd: number;
  } {
    const stats = this.getUsageStats();

    return {
      rpm: (stats.requestsThisMinute / this.config.maxRequestsPerMinute) * 100,
      tpm: (stats.tokensThisMinute / this.config.maxTokensPerMinute) * 100,
      rpd: (stats.requestsToday / this.config.maxRequestsPerDay) * 100,
    };
  }

  /**
   * Check if usage has crossed warning/critical thresholds
   */
  private checkThresholds(stats: UsageStats): void {
    const percentages = this.getUsagePercentages();
    const maxPercentage = Math.max(percentages.rpm, percentages.tpm, percentages.rpd);

    if (maxPercentage >= this.CRITICAL_THRESHOLD * 100) {
      this.triggerCritical(stats);
    } else if (maxPercentage >= this.WARNING_THRESHOLD * 100) {
      this.triggerWarning(stats);
    }
  }

  /**
   * Register callback for warning threshold (70%)
   */
  onWarning(callback: (stats: UsageStats) => void): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Register callback for critical threshold (90%)
   */
  onCritical(callback: (stats: UsageStats) => void): void {
    this.criticalCallbacks.push(callback);
  }

  /**
   * Register callback for when limit is reached
   */
  onLimitReached(callback: (limitType: string) => void): void {
    this.limitReachedCallbacks.push(callback);
  }

  /**
   * Trigger warning callbacks
   */
  private triggerWarning(stats: UsageStats): void {
    this.warningCallbacks.forEach(cb => {
      try {
        cb(stats);
      } catch (error) {
        console.error('Error in warning callback:', error);
      }
    });
  }

  /**
   * Trigger critical callbacks
   */
  private triggerCritical(stats: UsageStats): void {
    this.criticalCallbacks.forEach(cb => {
      try {
        cb(stats);
      } catch (error) {
        console.error('Error in critical callback:', error);
      }
    });
  }

  /**
   * Trigger limit reached callbacks
   */
  private triggerLimitReached(limitType: string): void {
    this.limitReachedCallbacks.forEach(cb => {
      try {
        cb(limitType);
      } catch (error) {
        console.error('Error in limit reached callback:', error);
      }
    });
  }

  /**
   * Get formatted usage report
   */
  getUsageReport(): string {
    const stats = this.getUsageStats();
    const percentages = this.getUsagePercentages();
    const timeUntilReset = this.lastDailyReset.getTime() - Date.now();
    const hoursUntilReset = Math.floor(timeUntilReset / (1000 * 60 * 60));
    const minutesUntilReset = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

    return `
🔵 Gemini API Usage Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Requests per Minute: ${stats.requestsThisMinute}/${this.config.maxRequestsPerMinute} (${percentages.rpm.toFixed(1)}%)
🎯 Tokens per Minute: ${stats.tokensThisMinute.toLocaleString()}/${this.config.maxTokensPerMinute.toLocaleString()} (${percentages.tpm.toFixed(1)}%)
📅 Requests Today: ${stats.requestsToday}/${this.config.maxRequestsPerDay} (${percentages.rpd.toFixed(1)}%)
💰 Tokens Today: ${stats.tokensToday.toLocaleString()}

⏰ Daily Reset: ${hoursUntilReset}h ${minutesUntilReset}m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
  }

  /**
   * Reset all counters (useful for testing)
   */
  reset(): void {
    this.requestTimestamps = [];
    this.tokenUsageByMinute.clear();
    this.dailyRequestCount = 0;
    this.dailyTokenCount = 0;
    this.lastDailyReset = this.getNextResetTime();
  }
}
