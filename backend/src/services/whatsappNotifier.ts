import axios from 'axios';
import { FastifyInstance } from 'fastify';

interface WhatsAppPayload {
  phone: string;
  message: string;
  apiKey?: string | null;
  deviceId?: string | null;
}

/**
 * Send a WhatsApp notification using the Deluxe CRM messaging API.
 * Non-blocking helper: logs errors without throwing.
 */
export async function sendWhatsAppNotification(
  fastify: FastifyInstance,
  { phone, message, apiKey, deviceId }: WhatsAppPayload
) {
  const resolvedApiKey = apiKey || process.env.WHATSAPP_API_KEY || process.env.DELUXE_CRM_API_KEY;
  const baseUrl = (process.env.WHATSAPP_API_BASE_URL ||
    process.env.DELUXE_CRM_API_URL ||
    'http://localhost:5000').replace(/\/$/, '');

  if (!resolvedApiKey || !phone) {
    fastify.log.warn('WhatsApp notification skipped: missing api key or phone');
    return;
  }

  try {
    await axios.post(
      `${baseUrl}/api/v1/send-message`,
      { phone, message, deviceId: deviceId || undefined },
      {
        headers: {
          'x-api-key': resolvedApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
      }
    );
    fastify.log.info(`WhatsApp notification sent to ${phone}`);
  } catch (error: any) {
    const status = error?.response?.status;
    fastify.log.error(`Failed to send WhatsApp notification (${status || 'no-status'}): ${error.message}`);
  }
}
