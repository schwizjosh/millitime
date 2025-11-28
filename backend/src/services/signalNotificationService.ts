import { FastifyInstance, FastifyReply } from 'fastify';
import { Client } from 'pg';
import { EventEmitter } from 'events';

interface SignalNotification {
  id: number;
  user_id: number;
  coin_id: string;
  coin_symbol: string;
  signal_type: string;
  price: number;
  strength: string;
  message: string;
  created_at: string;
}

/**
 * Service that listens to PostgreSQL notifications and broadcasts signals via SSE
 */
export class SignalNotificationService extends EventEmitter {
  private fastify: FastifyInstance;
  private pgClient: Client | null = null;
  private isListening = false;
  private sseClients: Map<number, Set<FastifyReply>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5 seconds

  constructor(fastify: FastifyInstance) {
    super();
    this.fastify = fastify;
  }

  /**
   * Start listening to PostgreSQL notifications
   */
  async start() {
    if (this.isListening) {
      this.fastify.log.info('Signal notification service is already running');
      return;
    }

    try {
      await this.connect();
      this.isListening = true;
      this.fastify.log.info('📡 Signal notification service started - listening for real-time signals');
    } catch (error: any) {
      this.fastify.log.error({ error }, 'Failed to start signal notification service');
      this.scheduleReconnect();
    }
  }

  /**
   * Connect to PostgreSQL and set up LISTEN
   */
  private async connect() {
    const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/millitime';

    this.pgClient = new Client({ connectionString });

    // Handle connection errors
    this.pgClient.on('error', (err) => {
      this.fastify.log.error({ err }, 'PostgreSQL notification client error');
      this.isListening = false;
      this.scheduleReconnect();
    });

    // Handle notifications
    this.pgClient.on('notification', (msg) => {
      if (msg.channel === 'new_signal' && msg.payload) {
        try {
          const signal: SignalNotification = JSON.parse(msg.payload);
          this.broadcastSignal(signal);
        } catch (error: any) {
          this.fastify.log.error({ error, payload: msg.payload }, 'Failed to parse signal notification');
        }
      }
    });

    await this.pgClient.connect();
    await this.pgClient.query('LISTEN new_signal');

    this.reconnectAttempts = 0;
    this.fastify.log.info('Connected to PostgreSQL LISTEN channel: new_signal');
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.fastify.log.error('Max reconnection attempts reached. Manual intervention required.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    this.fastify.log.info(
      `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        this.fastify.log.error({ error }, 'Reconnection attempt failed');
        this.scheduleReconnect();
      });
    }, delay);
  }

  /**
   * Broadcast signal to all SSE clients subscribed to this user
   */
  private broadcastSignal(signal: SignalNotification) {
    const clients = this.sseClients.get(signal.user_id);

    if (!clients || clients.size === 0) {
      this.fastify.log.debug(`No SSE clients connected for user ${signal.user_id}`);
      return;
    }

    const data = JSON.stringify(signal);
    const message = `data: ${data}\n\n`;

    let successCount = 0;
    let failureCount = 0;

    clients.forEach((reply) => {
      try {
        reply.raw.write(message);
        successCount++;
      } catch (error: any) {
        this.fastify.log.warn({ error, userId: signal.user_id }, 'Failed to send SSE message to client');
        this.removeClient(signal.user_id, reply);
        failureCount++;
      }
    });

    this.fastify.log.info(
      `📤 Broadcasted ${signal.signal_type} signal for ${signal.coin_symbol} to ${successCount} client(s) (user: ${signal.user_id})`
    );

    if (failureCount > 0) {
      this.fastify.log.warn(`Failed to send to ${failureCount} client(s)`);
    }
  }

  /**
   * Register SSE client for a user
   */
  addClient(userId: number, reply: FastifyReply) {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }

    this.sseClients.get(userId)!.add(reply);
    this.fastify.log.info(`SSE client connected for user ${userId} (total: ${this.sseClients.get(userId)!.size})`);

    // Send initial connection message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', message: 'Signal stream connected' })}\n\n`);
  }

  /**
   * Remove SSE client for a user
   */
  removeClient(userId: number, reply: FastifyReply) {
    const clients = this.sseClients.get(userId);

    if (clients) {
      clients.delete(reply);
      this.fastify.log.info(`SSE client disconnected for user ${userId} (remaining: ${clients.size})`);

      if (clients.size === 0) {
        this.sseClients.delete(userId);
      }
    }
  }

  /**
   * Get count of connected clients per user
   */
  getClientCount(userId: number): number {
    return this.sseClients.get(userId)?.size || 0;
  }

  /**
   * Get total connected clients across all users
   */
  getTotalClientCount(): number {
    let total = 0;
    this.sseClients.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }

  /**
   * Stop the notification service
   */
  async stop() {
    if (this.pgClient) {
      try {
        await this.pgClient.query('UNLISTEN new_signal');
        await this.pgClient.end();
        this.fastify.log.info('PostgreSQL notification client disconnected');
      } catch (error: any) {
        this.fastify.log.error({ error }, 'Error disconnecting PostgreSQL client');
      }

      this.pgClient = null;
    }

    // Close all SSE connections
    this.sseClients.forEach((clients) => {
      clients.forEach((reply) => {
        try {
          reply.raw.end();
        } catch (error) {
          // Ignore errors when closing
        }
      });
    });

    this.sseClients.clear();
    this.isListening = false;
    this.fastify.log.info('Signal notification service stopped');
  }
}
