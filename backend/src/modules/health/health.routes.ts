import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Minimalist server-style landing page
  server.get('/', async (request, reply) => {
    reply.type('text/html; charset=utf-8');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>memedeck-api :: status</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --panel: #11131a;
      --border: #232733;
      --text: #e6edf3;
      --muted: #6e7681;
      --green: #3fb950;
      --blue: #58a6ff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code', ui-monospace, monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      font-size: 13px;
      line-height: 1.6;
    }
    .server-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      max-width: 540px;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
    }
    .terminal-bar {
      background: #161922;
      border-bottom: 1px solid var(--border);
      padding: 9px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .traffic-lights {
      display: flex;
      gap: 6px;
      margin-right: 6px;
    }
    .light {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .red { background: #ff5f56; }
    .yellow { background: #ffbd2e; }
    .green-light { background: #27c93f; }
    .terminal-body {
      padding: 22px;
    }
    .prompt-line {
      color: var(--muted);
      margin-bottom: 16px;
    }
    .prompt {
      color: var(--blue);
    }
    .cmd {
      color: var(--text);
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px dashed #1c212c;
    }
    .status-row:last-of-type {
      border-bottom: none;
      margin-bottom: 18px;
    }
    .label {
      color: var(--muted);
    }
    .val {
      font-weight: 500;
    }
    .val-online {
      color: var(--green);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 7px;
      height: 7px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.85); }
    }
    .divider {
      height: 1px;
      background: var(--border);
      margin: 16px 0;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #238636;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn-primary:hover {
      background: #2ea043;
    }
    .btn-secondary {
      background: #21262d;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: #30363d;
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="server-box">
    <div class="terminal-bar">
      <div class="traffic-lights">
        <span class="light red"></span>
        <span class="light yellow"></span>
        <span class="light green-light"></span>
      </div>
      <span>memedeck-api@0.1.0 — status</span>
    </div>
    <div class="terminal-body">
      <div class="prompt-line">
        <span class="prompt">server@memedeck:~$</span> <span class="cmd">systemctl status memedeck-api</span>
      </div>

      <div class="status-row">
        <span class="label">service:</span>
        <span class="val">memedeck-api.service</span>
      </div>
      <div class="status-row">
        <span class="label">status:</span>
        <span class="val val-online"><span class="dot"></span>ACTIVE (operational)</span>
      </div>
      <div class="status-row">
        <span class="label">runtime:</span>
        <span class="val">node / fastify</span>
      </div>
      <div class="status-row">
        <span class="label">environment:</span>
        <span class="val">production</span>
      </div>
      <div class="status-row">
        <span class="label">timestamp:</span>
        <span class="val" id="ts">--</span>
      </div>

      <div class="divider"></div>

      <div class="actions">
        <a href="/docs" class="btn btn-primary">
          <span>&gt; open /docs</span>
        </a>
        <a href="/health" class="btn btn-secondary">
          <span>&gt; curl /health</span>
        </a>
      </div>
    </div>
  </div>
  <script>
    document.getElementById('ts').textContent = new Date().toISOString();
  </script>
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
