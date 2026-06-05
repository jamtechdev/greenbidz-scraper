/**
 * @file server.js — Entry point for the API server. Builds the Express app and
 *       listens. API-only — the UI is the separate Vite frontend
 *       (../Frontend, dev on http://localhost:5173).
 *
 * Run: `npm run dev`  (default http://localhost:4000)
 */

import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { testSequelize } from './config/sequelize.js';

const PORT = Number.parseInt(process.env.WEB_PORT, 10) || 4000;

const app = createApp();

app.listen(PORT, async () => {
  logger.info(`🌐 API server running at http://localhost:${PORT} (UI: Frontend on :5173)`);
  try {
    await testSequelize();
    logger.success('Database connection OK.');
  } catch (err) {
    logger.warn(`DB not reachable yet: ${err.message} (check DB_* env / run "npm run db:migrate")`);
  }
});
