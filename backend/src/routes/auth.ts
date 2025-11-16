import { FastifyInstance } from 'fastify';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { User, JWTPayload } from '../types';

interface RegisterBody {
  email: string;
  username: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  // Register new user
  fastify.post<{ Body: RegisterBody }>('/api/auth/register', async (request, reply) => {
    const { email, username, password } = request.body;

    // Validation
    if (!email || !username || !password) {
      return reply.code(400).send({ error: 'Email, username, and password are required' });
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters long' });
    }

    const client = await fastify.pg.connect();

    try {
      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        return reply.code(409).send({ error: 'User with this email or username already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Insert new user
      const result = await client.query<User>(
        'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
        [email, username, passwordHash]
      );

      const user = result.rows[0];

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
      });

      return reply.code(201).send({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          created_at: user.created_at,
        },
        token,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to register user' });
    } finally {
      client.release();
    }
  });

  // Login user
  fastify.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body;

    // Validation
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const client = await fastify.pg.connect();

    try {
      // Find user by email
      const result = await client.query<User>(
        'SELECT id, email, username, password_hash, created_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];

      // Compare password
      const isPasswordValid = await comparePassword(password, user.password_hash!);

      if (!isPasswordValid) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          created_at: user.created_at,
        },
        token,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to login' });
    } finally {
      client.release();
    }
  });

  // Get current user
  fastify.get('/api/auth/me', {
    preHandler: async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'No token provided' });
      }
    }
  }, async (request, reply) => {
    const authHeader = request.headers.authorization!;
    const token = authHeader.substring(7);

    const { verifyToken } = await import('../utils/auth');
    const payload = verifyToken(token);

    if (!payload) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    const client = await fastify.pg.connect();

    try {
      const result = await client.query<User>(
        'SELECT id, email, username, created_at FROM users WHERE id = $1',
        [payload.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({ user: result.rows[0] });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to get user' });
    } finally {
      client.release();
    }
  });
}
