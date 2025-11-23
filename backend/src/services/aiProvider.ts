/**
 * AI Provider Service - Strategic selection between OpenAI, Claude, and Gemini
 * Optimized for token efficiency and reliability
 */

import axios from 'axios';
import { GeminiRateLimiter } from './geminiRateLimiter';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  cached?: boolean;
}

export interface AIConfig {
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  geminiKeys?: string[]; // Support multiple Gemini keys for rotation
  preferredProvider?: 'openai' | 'anthropic' | 'gemini' | 'auto';
  maxTokens?: number;
  temperature?: number;
}

export class AIProviderService {
  private config: AIConfig;
  private responseCache: Map<string, { response: AIResponse; timestamp: number }> = new Map();
  private cacheExpiryMs = 15 * 60 * 1000; // 15 minutes cache
  private geminiRateLimiter: GeminiRateLimiter;
  private lastUsageReport: number = 0;
  private usageReportIntervalMs = 60 * 60 * 1000; // Report every hour
  private geminiKeys: string[] = []; // Array of Gemini API keys for rotation
  private currentGeminiKeyIndex: number = 0; // Track which key to use next
  private keyUsageToday: Map<string, number> = new Map(); // Track requests per key per day
  private dailyResetTime: Date = this.getNextDailyReset(); // Track when to reset counters
  private maxRequestsPerKeyPerDay: number = 250; // Free tier limit per key

  constructor(config: AIConfig) {
    this.config = {
      maxTokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent trading analysis
      preferredProvider: 'auto',
      ...config,
    };

    // Initialize Gemini keys for rotation
    if (config.geminiKeys && config.geminiKeys.length > 0) {
      this.geminiKeys = config.geminiKeys.filter(key => key && key.trim().length > 0);
      console.log(`🔄 Initialized with ${this.geminiKeys.length} Gemini API keys for rotation`);
    } else if (config.geminiKey) {
      this.geminiKeys = [config.geminiKey];
    }

    // Initialize Gemini rate limiter with configurable limits (defaults to free tier)
    this.geminiRateLimiter = new GeminiRateLimiter({
      maxRequestsPerMinute: parseInt(process.env.GEMINI_RPM_LIMIT || '10', 10),
      maxTokensPerMinute: parseInt(process.env.GEMINI_TPM_LIMIT || '250000', 10),
      maxRequestsPerDay: parseInt(process.env.GEMINI_RPD_LIMIT || '250', 10),
    });

    // Setup rate limit callbacks
    this.setupRateLimitCallbacks();
  }

  /**
   * Calculate next daily reset time (midnight Pacific Time)
   */
  private getNextDailyReset(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    // Adjust for Pacific Time (UTC-8 or UTC-7 depending on DST)
    return tomorrow;
  }

  /**
   * Check if we need to reset daily counters
   */
  private checkDailyReset(): void {
    const now = new Date();
    if (now >= this.dailyResetTime) {
      console.log('🔄 Daily reset: Clearing per-key usage counters');
      this.keyUsageToday.clear();
      this.dailyResetTime = this.getNextDailyReset();
    }
  }

  /**
   * Get the next available Gemini API key using round-robin rotation
   * Skips keys that have hit the daily limit
   */
  private getNextGeminiKey(): string | undefined {
    if (this.geminiKeys.length === 0) return undefined;

    // Check if daily reset is needed
    this.checkDailyReset();

    // Try to find an available key (not exhausted)
    let attempts = 0;
    while (attempts < this.geminiKeys.length) {
      const key = this.geminiKeys[this.currentGeminiKeyIndex];
      const usage = this.keyUsageToday.get(key) || 0;

      // Move to next key for future calls
      this.currentGeminiKeyIndex = (this.currentGeminiKeyIndex + 1) % this.geminiKeys.length;
      attempts++;

      // Check if this key is still available
      if (usage < this.maxRequestsPerKeyPerDay) {
        if (this.geminiKeys.length > 1) {
          const keyLabel = key.substring(key.length - 8); // Last 8 chars for identification
          console.log(`🔄 Using Gemini key ...${keyLabel} (${usage}/${this.maxRequestsPerKeyPerDay} used today)`);
        }
        return key;
      } else {
        const keyLabel = key.substring(key.length - 8);
        console.warn(`⚠️  Key ...${keyLabel} exhausted (${usage}/${this.maxRequestsPerKeyPerDay}), trying next key`);
      }
    }

    // All keys exhausted
    console.error('🛑 All Gemini API keys have reached their daily limit!');
    throw new Error('All Gemini API keys exhausted for today');
  }

  /**
   * Record usage for a specific API key
   */
  private recordKeyUsage(apiKey: string): void {
    const currentUsage = this.keyUsageToday.get(apiKey) || 0;
    this.keyUsageToday.set(apiKey, currentUsage + 1);
  }

  /**
   * Setup callbacks for rate limit monitoring
   */
  private setupRateLimitCallbacks(): void {
    const rpmLimit = parseInt(process.env.GEMINI_RPM_LIMIT || '10', 10);
    const rpdLimit = parseInt(process.env.GEMINI_RPD_LIMIT || '250', 10);

    // Warning at 70% of any limit
    this.geminiRateLimiter.onWarning((stats) => {
      const percentages = this.geminiRateLimiter.getUsagePercentages();
      console.warn(
        `⚠️  Gemini API usage at ${Math.max(percentages.rpm, percentages.tpm, percentages.rpd).toFixed(0)}% of limit`,
        `\n   RPM: ${stats.requestsThisMinute}/${rpmLimit}, RPD: ${stats.requestsToday}/${rpdLimit}`
      );
    });

    // Critical at 90% of any limit
    this.geminiRateLimiter.onCritical((stats) => {
      const percentages = this.geminiRateLimiter.getUsagePercentages();
      console.error(
        `🚨 Gemini API usage CRITICAL at ${Math.max(percentages.rpm, percentages.tpm, percentages.rpd).toFixed(0)}%!`,
        `\n   RPM: ${stats.requestsThisMinute}/${rpmLimit}, RPD: ${stats.requestsToday}/${rpdLimit}`,
        `\n   Will fallback to OpenAI/Claude if limits exceeded`
      );
    });

    // Limit reached - force fallback
    this.geminiRateLimiter.onLimitReached((limitType) => {
      console.error(
        `🛑 Gemini API ${limitType} limit reached! Falling back to OpenAI/Claude for this request.`
      );
    });
  }

  /**
   * Strategically select the best AI provider for the task
   * Gemini: Best for cost efficiency, fast, strong math/reasoning (PRIMARY)
   * Strategy: Gemini Pro (CoT) → Gemini Flash → OpenAI → Claude
   */
  private selectProvider(taskComplexity: 'simple' | 'moderate' | 'complex'): 'openai' | 'anthropic' | 'gemini' {
    if (this.config.preferredProvider && this.config.preferredProvider !== 'auto') {
      return this.config.preferredProvider;
    }

    // Check which keys are available
    const hasGemini = this.geminiKeys.length > 0 || !!this.config.geminiKey;
    const hasOpenAI = !!this.config.openaiKey;
    const hasClaude = !!this.config.anthropicKey;

    if (!hasGemini && !hasOpenAI && !hasClaude) {
      throw new Error('No AI provider keys configured');
    }

    // ALWAYS prefer Gemini for ALL tasks (technical + fundamental analysis)
    // Gemini Pro (CoT) tries first, then falls back to Flash automatically
    if (hasGemini) {
      console.log(`📊 Selected Gemini (Pro→Flash) for ${taskComplexity} task`);
      return 'gemini';
    }

    // Fallback to OpenAI if Gemini not available (rare)
    if (hasOpenAI) {
      console.warn('⚠️  Using OpenAI fallback (Gemini unavailable)');
      return 'openai';
    }

    // Last resort: Claude (most expensive)
    if (hasClaude) {
      console.warn('⚠️  Using Claude fallback (Gemini & OpenAI unavailable)');
      return 'anthropic';
    }

    throw new Error('No AI provider keys configured');
  }

  /**
   * Generate cache key for response caching
   */
  private getCacheKey(messages: AIMessage[], provider: string): string {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|');
    return `${provider}:${Buffer.from(content).toString('base64')}`;
  }

  /**
   * Check cache for recent identical requests
   */
  private getFromCache(cacheKey: string): AIResponse | null {
    const cached = this.responseCache.get(cacheKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheExpiryMs) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    return { ...cached.response, cached: true };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(messages: AIMessage[], maxTokens: number): Promise<AIResponse> {
    if (!this.config.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini', // Cost-effective model with good performance
        messages,
        max_tokens: maxTokens,
        temperature: this.config.temperature,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.openaiKey}`,
        },
      }
    );

    return {
      content: response.data.choices[0].message.content,
      tokensUsed: response.data.usage.total_tokens,
      model: response.data.model,
      provider: 'openai',
      cached: false,
    };
  }

  /**
   * Call Anthropic Claude API
   */
  private async callClaude(messages: AIMessage[], maxTokens: number): Promise<AIResponse> {
    if (!this.config.anthropicKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Convert messages format for Claude
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-5-20250929', // Premium accuracy model - 56% better reasoning than Haiku
        max_tokens: maxTokens,
        temperature: this.config.temperature,
        system: systemMessage,
        messages: conversationMessages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.anthropicKey,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    return {
      content: response.data.content[0].text,
      tokensUsed: response.data.usage.input_tokens + response.data.usage.output_tokens,
      model: response.data.model,
      provider: 'anthropic',
      cached: false,
    };
  }

  /**
   * Call Google Gemini API with tiered model strategy
   * Priority: 2.5-Pro on ALL keys first → 2.5-Flash → OpenAI/Claude
   * Only falls back to Flash when ALL keys have exhausted Pro quota
   */
  private async callGemini(messages: AIMessage[], maxTokens: number): Promise<AIResponse> {
    const totalKeys = this.geminiKeys.length || 1;
    let proAttempts = 0;
    let lastProError: any = null;

    // Try Gemini 2.5 Pro on ALL available keys first
    while (proAttempts < totalKeys) {
      try {
        return await this.callGeminiModel(messages, maxTokens, 'gemini-2.5-pro');
      } catch (proError: any) {
        lastProError = proError;
        proAttempts++;

        const isRateLimit = proError.message?.includes('429') ||
                           proError.message?.includes('quota') ||
                           proError.message?.includes('RATE_LIMIT');

        if (isRateLimit && proAttempts < totalKeys) {
          console.log(`🔄 Gemini 2.5 Pro rate limited on key ${proAttempts}/${totalKeys}, trying next key...`);
          continue; // Try next key with Pro
        } else if (isRateLimit) {
          console.log(`🛑 Gemini 2.5 Pro exhausted on ALL ${totalKeys} keys, falling back to Flash`);
          break; // All keys exhausted, fall back to Flash
        } else {
          // Non-rate-limit error (API error, etc.) - fall back to Flash immediately
          console.log(`⚠️  Gemini 2.5 Pro failed (${proError.message}), trying Flash...`);
          break;
        }
      }
    }

    // Fallback to Gemini 2.5 Flash (higher limits, faster)
    return await this.callGeminiModel(messages, maxTokens, 'gemini-2.5-flash');
  }

  /**
   * Call specific Gemini model
   */
  private async callGeminiModel(
    messages: AIMessage[],
    maxTokens: number,
    model: 'gemini-2.5-pro' | 'gemini-2.5-flash'
  ): Promise<AIResponse> {
    // Get next API key from rotation
    const apiKey = this.getNextGeminiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Estimate token usage (rough estimate: 1 token ≈ 4 chars)
    const estimatedInputTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    const estimatedTotalTokens = estimatedInputTokens + maxTokens;

    // Check rate limits BEFORE making the request
    const limitCheck = this.geminiRateLimiter.canMakeRequest(estimatedTotalTokens);

    if (!limitCheck.allowed) {
      console.warn(`🛑 Gemini ${model} rate limit: ${limitCheck.reason}`);
      throw new Error(`RATE_LIMIT: ${limitCheck.reason}`);
    }

    // Convert messages format for Gemini
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationParts = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        text: m.content,
      }));

    // Prepend system message as first user message if present
    if (systemMessage) {
      conversationParts.unshift({ text: `System Instructions: ${systemMessage}` });
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: conversationParts,
        }],
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: Math.max(maxTokens * 3, 4096), // Gemini needs much higher limit for complex analysis
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    // Validate response structure
    if (!response.data.candidates || !response.data.candidates[0]) {
      throw new Error(`Gemini API returned invalid response: ${JSON.stringify(response.data)}`);
    }

    const totalTokens = response.data.usageMetadata?.totalTokenCount || 0;
    const content = response.data.candidates[0].content?.parts?.[0]?.text;

    if (!content) {
      throw new Error(`Gemini API response missing content: ${JSON.stringify(response.data.candidates[0])}`);
    }

    // Record successful request for rate limiting
    this.geminiRateLimiter.recordRequest(totalTokens);

    // Record per-key usage for rotation tracking
    this.recordKeyUsage(apiKey);

    // Periodic usage reporting (hourly)
    const now = Date.now();
    if (now - this.lastUsageReport > this.usageReportIntervalMs) {
      console.log('\n' + this.geminiRateLimiter.getUsageReport());
      this.lastUsageReport = now;
    }

    // Log which model was used
    const modelIcon = model === 'gemini-2.5-pro' ? '🧠' : '⚡';
    console.log(`${modelIcon} Used ${model} (${totalTokens} tokens)`);

    return {
      content,
      tokensUsed: totalTokens,
      model: model,
      provider: 'gemini',
      cached: false,
    };
  }

  /**
   * Generate AI completion with automatic provider selection and caching
   */
  async complete(
    messages: AIMessage[],
    options?: {
      maxTokens?: number;
      taskComplexity?: 'simple' | 'moderate' | 'complex';
      bypassCache?: boolean;
    }
  ): Promise<AIResponse> {
    const maxTokens = options?.maxTokens || this.config.maxTokens || 1000;
    const taskComplexity = options?.taskComplexity || 'moderate';
    const provider = this.selectProvider(taskComplexity);

    // Check cache unless bypassed
    if (!options?.bypassCache) {
      const cacheKey = this.getCacheKey(messages, provider);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let response: AIResponse;

    try {
      if (provider === 'gemini') {
        response = await this.callGemini(messages, maxTokens);
      } else if (provider === 'openai') {
        response = await this.callOpenAI(messages, maxTokens);
      } else {
        response = await this.callClaude(messages, maxTokens);
      }

      // Cache the response
      const cacheKey = this.getCacheKey(messages, provider);
      this.responseCache.set(cacheKey, { response, timestamp: Date.now() });

      return response;
    } catch (error: any) {
      const isRateLimit = error.message?.includes('RATE_LIMIT');

      if (isRateLimit) {
        console.warn(`⚠️  ${provider} rate limit hit, using fallback providers`);
      } else {
        console.log(`AI provider ${provider} failed (${error.message}), attempting fallback...`);
      }

      // Try fallback providers in order
      // If Gemini hit rate limit, skip it in fallback chain
      const fallbackProviders: Array<'gemini' | 'openai' | 'anthropic'> = [];

      if (provider !== 'gemini' && this.config.geminiKey && !isRateLimit) {
        fallbackProviders.push('gemini');
      }
      if (provider !== 'openai' && this.config.openaiKey) {
        fallbackProviders.push('openai');
      }
      if (provider !== 'anthropic' && this.config.anthropicKey) {
        fallbackProviders.push('anthropic');
      }

      for (const fallbackProvider of fallbackProviders) {
        try {
          console.log(`Trying fallback provider: ${fallbackProvider}`);

          if (fallbackProvider === 'gemini') {
            response = await this.callGemini(messages, maxTokens);
          } else if (fallbackProvider === 'openai') {
            response = await this.callOpenAI(messages, maxTokens);
          } else {
            response = await this.callClaude(messages, maxTokens);
          }

          console.log(`✅ Successfully fell back to ${fallbackProvider}`);
          return response;
        } catch (fallbackError: any) {
          console.log(`Fallback provider ${fallbackProvider} also failed: ${fallbackError.message}`);
          continue;
        }
      }

      throw new Error(`All AI providers failed. Original error: ${error.message}`);
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.responseCache.entries()) {
      if (now - value.timestamp > this.cacheExpiryMs) {
        this.responseCache.delete(key);
      }
    }
  }

  /**
   * Get current Gemini API usage statistics
   */
  getGeminiUsageStats() {
    return {
      stats: this.geminiRateLimiter.getUsageStats(),
      percentages: this.geminiRateLimiter.getUsagePercentages(),
      report: this.geminiRateLimiter.getUsageReport(),
    };
  }

  /**
   * Get formatted usage report for all providers
   */
  getUsageReport(): string {
    return this.geminiRateLimiter.getUsageReport();
  }
}
