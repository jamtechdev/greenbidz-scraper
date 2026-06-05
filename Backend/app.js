/**
 * @file app.js — Express application factory. API-only; serves the /api routes
 * consumed by the separate Vite frontend (cross-origin → CORS enabled).
 */
import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/index.js';

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '5mb' }));

  // Root: a tiny API banner (the UI lives in the separate Frontend project).
  app.get('/', (req, res) => {
    res.json({
      ok: true,
      service: 'product-monitor-api',
      ui: 'Run the Frontend project (Vite) at http://localhost:5173',
    });
  });

  app.use('/api', apiRouter);

  // 404
  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  // Error handler — mirrors the previous server's 500 behaviour.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error(`Web request failed (${req.path}): ${err.message}`, { stack: err.stack });
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err.message });
  });

  return app;
}

export default createApp;
