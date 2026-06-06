/**
 * API server entrypoint (BuildSpec §2, Phase 0). Boots Express, runs DB
 * migrations, mounts auth + engine routes, and exposes /health.
 *
 * Sentry (BuildSpec §3): initialize here when SENTRY_DSN is configured. Left as
 * a hook to avoid pulling the dependency before it's needed.
 */
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from './config/env.js';
import { dbHealthy, migrate } from './db/client.js';
import { analyzeRouter } from './routes/analyze.js';
import { authRouter } from './routes/auth.js';
import { dealsRouter } from './routes/deals.js';
import { reportsRouter } from './routes/reports.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health check (Phase 0 acceptance: returns 200, DB connects).
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', db: dbHealthy() ? 'connected' : 'down' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/analyze', analyzeRouter);
  app.use('/api/deals', dealsRouter);
  app.use('/api/reports', reportsRouter);

  // Single-service deploy: serve the built client when present so the whole app
  // runs from one origin (same-origin cookies, relative /api). No-op in dev
  // where the client is served by Vite.
  const clientDist = [
    resolve(process.cwd(), '../client/dist'),
    resolve(process.cwd(), 'client/dist'),
  ].find((p) => existsSync(p));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/health') return next();
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  }

  return app;
}

export function start(): void {
  migrate();
  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`ARV Engine API listening on :${env.port} (${env.nodeEnv})`);
  });
}

// Boot when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  start();
}
