import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../utils/auth';
import { JWTPayload } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const payload = verifyToken(token);

    if (!payload) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    request.user = payload;
  } catch (error) {
    return reply.code(401).send({ error: 'Authentication failed' });
  }
}
