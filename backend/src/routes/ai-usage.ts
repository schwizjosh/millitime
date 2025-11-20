/**
 * AI Usage Statistics API Routes
 * Provides visibility into Gemini API usage and billing protection
 */

import { FastifyInstance } from 'fastify';
import { AIProviderService } from '../services/aiProvider';

interface AIUsageRoutesOptions {
  aiProvider?: AIProviderService;
}

export default async function aiUsageRoutes(
  fastify: FastifyInstance,
  options: AIUsageRoutesOptions
) {
  const { aiProvider } = options;
  /**
   * GET /api/ai-usage/stats
   * Get current AI usage statistics
   */
  fastify.get('/api/ai-usage/stats', {
    schema: {
      description: 'Get current AI API usage statistics',
      tags: ['AI'],
      response: {
        200: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            gemini: {
              type: 'object',
              properties: {
                requestsThisMinute: { type: 'number' },
                tokensThisMinute: { type: 'number' },
                requestsToday: { type: 'number' },
                tokensToday: { type: 'number' },
                limits: {
                  type: 'object',
                  properties: {
                    requestsPerMinute: { type: 'number' },
                    tokensPerMinute: { type: 'number' },
                    requestsPerDay: { type: 'number' },
                  },
                },
                percentages: {
                  type: 'object',
                  properties: {
                    rpm: { type: 'number' },
                    tpm: { type: 'number' },
                    rpd: { type: 'number' },
                  },
                },
                nextResetTime: { type: 'string' },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        if (!aiProvider) {
          return reply.status(503).send({
            error: 'AI services not initialized',
            message: 'AI provider is not available',
          });
        }

        const geminiStats = aiProvider.getGeminiUsageStats();

        return {
          provider: process.env.AI_PROVIDER || 'auto',
          gemini: {
            requestsThisMinute: geminiStats.stats.requestsThisMinute,
            tokensThisMinute: geminiStats.stats.tokensThisMinute,
            requestsToday: geminiStats.stats.requestsToday,
            tokensToday: geminiStats.stats.tokensToday,
            limits: {
              requestsPerMinute: parseInt(process.env.GEMINI_RPM_LIMIT || '10', 10),
              tokensPerMinute: parseInt(process.env.GEMINI_TPM_LIMIT || '250000', 10),
              requestsPerDay: parseInt(process.env.GEMINI_RPD_LIMIT || '250', 10),
            },
            percentages: {
              rpm: geminiStats.percentages.rpm,
              tpm: geminiStats.percentages.tpm,
              rpd: geminiStats.percentages.rpd,
            },
            nextResetTime: geminiStats.stats.dailyResetTime.toISOString(),
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, 'Error getting AI usage stats');
        return reply.status(500).send({
          error: 'Internal server error',
          message: error.message,
        });
      }
    },
  });

  /**
   * GET /api/ai-usage/report
   * Get formatted usage report
   */
  fastify.get('/api/ai-usage/report', {
    schema: {
      description: 'Get formatted AI usage report',
      tags: ['AI'],
      response: {
        200: {
          type: 'object',
          properties: {
            report: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        if (!aiProvider) {
          return reply.status(503).send({
            error: 'AI services not initialized',
          });
        }

        const report = aiProvider.getUsageReport();

        return {
          report,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        fastify.log.error({ error }, 'Error getting AI usage report');
        return reply.status(500).send({
          error: 'Internal server error',
          message: error.message,
        });
      }
    },
  });
}
