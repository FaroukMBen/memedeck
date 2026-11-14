import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { env } from './config/env.js';

let appInstance: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    appInstance = await buildApp();
    await appInstance.ready();
  }
  return appInstance;
}

async function start(): Promise<void> {
  const app = await getApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`MemeDeck API listening on http://${env.HOST}:${env.PORT}`);
    app.log.info(`Swagger docs available at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only listen locally or in container
if (!process.env.VERCEL) {
  start();
}

// Export default handler for Vercel Serverless Functions
export default async function handler(req: any, res: any): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}


