/**
 * AI Provider Service - Strategic selection between OpenAI and Claude
 * Optimized for token efficiency and reliability
 */

import axios from 'axios';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: 'openai' | 'anthropic';
  cached?: boolean;
}

export interface AIConfig {
  openaiKey?: string;
  anthropicKey?: string;
  preferredProvider?: 'openai' | 'anthropic' | 'auto';
  maxTokens?: number;
  temperature?: number;
}

export class AIProviderService {
  private config: AIConfig;
  private responseCache: Map<string, { response: AIResponse; timestamp: number }> = new Map();
  private cacheExpiryMs = 15 * 60 * 1000; // 15 minutes cache

  constructor(config: AIConfig) {
    this.config = {
      maxTokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent trading analysis
      preferredProvider: 'auto',
      ...config,
    };
  }

  /**
   * Strategically select the best AI provider for the task
   * OpenAI: Better for structured data analysis, cheaper for simple tasks
   * Claude: Better for complex reasoning, nuanced analysis
   */
  private selectProvider(taskComplexity: 'simple' | 'moderate' | 'complex'): 'openai' | 'anthropic' {
    if (this.config.preferredProvider && this.config.preferredProvider !== 'auto') {
      return this.config.preferredProvider;
    }

    // Check which keys are available
    const hasOpenAI = !!this.config.openaiKey;
    const hasClaude = !!this.config.anthropicKey;

    if (!hasOpenAI && !hasClaude) {
      throw new Error('No AI provider keys configured');
    }

    if (!hasOpenAI) return 'anthropic';
    if (!hasClaude) return 'openai';

    // Strategic selection based on task complexity
    switch (taskComplexity) {
      case 'simple':
        // Use OpenAI for simple tasks (cheaper, faster)
        return 'openai';
      case 'moderate':
        // Alternate or use OpenAI for cost efficiency
        return 'openai';
      case 'complex':
        // Use Claude for complex reasoning and nuanced analysis
        return 'anthropic';
      default:
        return 'openai';
    }
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
        model: 'claude-3-5-haiku-20241022', // Fast, cost-effective model
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
      if (provider === 'openai') {
        response = await this.callOpenAI(messages, maxTokens);
      } else {
        response = await this.callClaude(messages, maxTokens);
      }

      // Cache the response
      const cacheKey = this.getCacheKey(messages, provider);
      this.responseCache.set(cacheKey, { response, timestamp: Date.now() });

      return response;
    } catch (error: any) {
      // Fallback to other provider on error
      const fallbackProvider = provider === 'openai' ? 'anthropic' : 'openai';
      const hasFallback =
        fallbackProvider === 'openai' ? this.config.openaiKey : this.config.anthropicKey;

      if (hasFallback) {
        console.log(`AI provider ${provider} failed, falling back to ${fallbackProvider}`);
        if (fallbackProvider === 'openai') {
          response = await this.callOpenAI(messages, maxTokens);
        } else {
          response = await this.callClaude(messages, maxTokens);
        }
        return response;
      }

      throw error;
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
}
