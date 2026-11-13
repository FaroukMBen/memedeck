import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import fp from 'fastify-plugin';
import { createUserSupabaseClient, supabaseAdmin } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    accessToken?: string;
    supabase?: SupabaseClient;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', undefined);
  app.decorateRequest('accessToken', undefined);
  app.decorateRequest('supabase', undefined);

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearerToken(request);
    if (!token) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization Bearer token',
      });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired access token',
      });
    }

    request.user = { id: data.user.id, email: data.user.email };
    request.accessToken = token;
    request.supabase = createUserSupabaseClient(token);
  });

  app.decorate('optionalAuth', async (request: FastifyRequest) => {
    const token = extractBearerToken(request);
    if (!token) {
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data.user) {
      request.user = { id: data.user.id, email: data.user.email };
      request.accessToken = token;
      request.supabase = createUserSupabaseClient(token);
    }
  });
}

export default fp(authPlugin, { name: 'auth-plugin' });

