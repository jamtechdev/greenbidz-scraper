/**
 * @file app.js — Express application factory. API-only; serves the /api routes
 * consumed by the separate Vite frontend (cross-origin → CORS enabled).
 */
import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/index.js';
import { CONSTANTS } from './config/constants.js';

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Parse multiple CORS origins from comma-separated string
const corsOrigins = CORS_ORIGIN === '*' 
  ? '*' 
  : CORS_ORIGIN.split(',').map(origin => origin.trim());

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS',"PUT", "PATCH", "DELETE"],
      allowedHeaders: ['Content-Type'],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '5mb' }));

  // Serve locally-downloaded product images (downloads/{domain}/{id}/…) so the
  // frontend can render them via /downloads/... when downloadImages is on.
  app.use('/downloads', express.static(CONSTANTS.DOWNLOADS_DIR, { fallthrough: true, maxAge: '1h' }));

  // Root: a tiny API banner (the UI lives in the separate Frontend project).
  app.get('/', (req, res) => {
    res.json({
      ok: true,
      service: 'greenbidz-scraper-api',
      ui: 'Frontend - https://greenbidzscraper.onrender.com',
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
