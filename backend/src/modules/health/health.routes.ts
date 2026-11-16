import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Landing page for the backend root
  server.get('/', async (request, reply) => {
    reply.type('text/html; charset=utf-8');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MemeDeck API · Status & Docs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0e1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #f0f6fc;
      --text-muted: #8b949e;
      --green: #238636;
      --green-glow: rgba(35, 134, 54, 0.4);
      --accent: #2f81f7;
      --accent-hover: #58a6ff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Space Grotesk', -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      max-width: 520px;
      width: 100%;
      padding: 2.5rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      text-align: center;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      fill: var(--accent);
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 2rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(35, 134, 54, 0.15);
      border: 1px solid rgba(35, 134, 54, 0.4);
      color: #3fb950;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.88rem;
      font-family: 'IBM Plex Mono', monospace;
      font-weight: 600;
      margin-bottom: 2rem;
    }
    .dot {
      width: 8px;
      height: 8px;
      background: #3fb950;
      border-radius: 50%;
      box-shadow: 0 0 10px #3fb950;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.85rem 1.4rem;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--accent);
      color: #ffffff;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--text-muted);
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.8rem;
      font-family: 'IBM Plex Mono', monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M10 9V4h15l4 4v15h-6" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M3 9h16l4 4v16H3z" fill="var(--accent)" stroke="currentColor" stroke-width="1.5" />
        <path d="M8.5 25l9-12" fill="none" stroke="#ffffff" stroke-width="3" />
      </svg>
      <span>MemeDeck API</span>
    </div>
    <p class="subtitle">High-performance community-driven media library & party game asset-sharing platform.</p>

    <div class="status-badge">
      <span class="dot"></span>
      <span>API Operational · Healthy</span>
    </div>

    <div class="actions">
      <a href="/docs" class="btn btn-primary">
        <span>📖 Explore Swagger Documentation</span>
      </a>
      <a href="/health" class="btn btn-secondary">
        <span>⚡ Check /health (JSON)</span>
      </a>
    </div>

    <div class="footer">
      MemeDeck API v0.1.0 · Fastify Server
    </div>
  </div>
</body>
</html>`;
  });

  server.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Health check',
        response: {
          200: z.object({
            status: z.literal('ok'),
            timestamp: z.string(),
          }),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    })
  );
}

