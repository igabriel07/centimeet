import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../env';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email?: string };
  }
}

/**
 * Ελέγχει το access token του Supabase (Authorization: Bearer ...).
 * - Νέα projects: ασύμμετρα κλειδιά μέσω JWKS
 * - Παλιά projects: HS256 με SUPABASE_JWT_SECRET
 */
export function makeAuthHook(env: Env) {
  const jwks = env.SUPABASE_URL
    ? createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    : null;
  const secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

  async function verify(token: string): Promise<JWTPayload> {
    if (secret) return (await jwtVerify(token, secret)).payload;
    if (jwks) return (await jwtVerify(token, jwks)).payload;
    throw new Error('Δεν έχει ρυθμιστεί έλεγχος token');
  }

  return async function authHook(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (env.REQUIRE_AUTH) return reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    try {
      const payload = await verify(token);
      if (!payload.sub) throw new Error('no sub');
      req.user = { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  };
}
