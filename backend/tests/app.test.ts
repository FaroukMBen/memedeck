import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('MemeDeck API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /docs/json serves OpenAPI 3 specification', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs/json',
    });

    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.info.title).toBe('MemeDeck API');
  });

  it('GET /api/v1/users/me returns 401 without Authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/collections returns 401 without Authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collections',
      payload: { title: 'Party Pack', is_public: true },
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/medias/:mediaId/fork returns 401 without Authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/medias/11111111-1111-1111-1111-111111111111/fork',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/collections/:collectionId validates UUID parameters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/collections/not-a-valid-uuid',
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/users/:userId/profile validates UUID parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/invalid-uuid/profile',
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/users/:userId/comments requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/11111111-1111-1111-1111-111111111111/comments',
      payload: { content: 'Cool memes!' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/users/:userId/friend-request requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/11111111-1111-1111-1111-111111111111/friend-request',
    });

    expect(res.statusCode).toBe(401);
  });
});

