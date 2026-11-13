import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { compressVideoOrGif } from '../src/lib/video.js';

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

  it('compressVideoOrGif passes through non-video assets safely', async () => {
    const fakeBuffer = Buffer.from('hello-image-png');
    const result = await compressVideoOrGif(fakeBuffer, 'image/png', 'sample.png');

    expect(result.wasCompressed).toBe(false);
    expect(result.mimeType).toBe('image/png');
    expect(result.buffer.toString()).toBe('hello-image-png');
  });

  it('compressVideoOrGif successfully compresses a video asset', async () => {
    // Generate a quick synthetic raw video in memory or tmp
    const { execFile } = await import('node:child_process');
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const ffmpegStatic = await import('ffmpeg-static');
    const ffmpegPath = typeof ffmpegStatic.default === 'string' ? ffmpegStatic.default : (ffmpegStatic as any);

    const tmpIn = path.join(os.tmpdir(), `vitest-test-in-${Date.now()}.mp4`);
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', tmpIn], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const rawBuffer = await fs.readFile(tmpIn);
    await fs.unlink(tmpIn).catch(() => {});

    const result = await compressVideoOrGif(rawBuffer, 'video/mp4', 'test-video.mp4');
    console.log('Test video compression result:', {
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      wasCompressed: result.wasCompressed,
      savings: Math.round(((result.originalSize - result.compressedSize) / result.originalSize) * 100) + '%'
    });

    expect(result.wasCompressed).toBe(true);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  }, 30000);

  it('compressVideoOrGif actively optimizes low-resolution videos (480x480)', async () => {
    const { execFile } = await import('node:child_process');
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const ffmpegStatic = await import('ffmpeg-static');
    const ffmpegPath = typeof ffmpegStatic.default === 'string' ? ffmpegStatic.default : (ffmpegStatic as any);

    const tmpIn = path.join(os.tmpdir(), `vitest-test-lowres-${Date.now()}.mp4`);
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=480x480:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', tmpIn], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const rawBuffer = await fs.readFile(tmpIn);
    await fs.unlink(tmpIn).catch(() => {});

    const result = await compressVideoOrGif(rawBuffer, 'video/mp4', 'lowres-480.mp4');
    console.log('Low-res 480x480 compression result:', {
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      wasCompressed: result.wasCompressed,
      savings: Math.round(((result.originalSize - result.compressedSize) / result.originalSize) * 100) + '%'
    });

    expect(result.wasCompressed).toBe(true);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  }, 30000);
});

