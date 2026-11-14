import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import { registerSwagger } from './plugins/swagger.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { mediasRoutes } from './modules/medias/medias.routes.js';
import { collectionsRoutes } from './modules/collections/collections.routes.js';
import { socialRoutes } from './modules/social/social.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.NODE_ENV === 'development' ? 'info' : 'warn',
            transport:
              env.NODE_ENV === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { colorize: true },
                  }
                : undefined,
          },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  });

  app.setErrorHandler((error: any, request, reply) => {
    app.log.error(error);
    const origin = request.headers.origin;
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    reply.status(error.statusCode ?? 500).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB max per media asset
      files: 1,
    },
  });

  await app.register(authPlugin);
  await registerSwagger(app);

  await app.register(healthRoutes);
  await app.register(usersRoutes);
  await app.register(mediasRoutes);
  await app.register(collectionsRoutes);
  await app.register(socialRoutes);

  return app;
}

let defaultApp: FastifyInstance | null = null;

export default async function handler(req: any, res: any): Promise<void> {
  if (!defaultApp) {
    defaultApp = await buildApp();
    await defaultApp.ready();
  }
  defaultApp.server.emit('request', req, res);
}


