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
import { initScheduler } from './scheduler/scheduler-manager.js';
import { initSyncScheduler } from './scheduler/sync-scheduler.js';

const PORT = Number.parseInt(process.env.WEB_PORT, 10) || 4000;

/** Auto-start the recurring crawl. Default OFF (starts paused) so existing flow
 *  is unchanged; set SCHEDULER_AUTOSTART=true to have it active on boot. */
const SCHEDULER_AUTOSTART = /^(true|1|yes)$/i.test(String(process.env.SCHEDULER_AUTOSTART || ''));
/** Auto-start the recurring sync. Default OFF; set SYNC_SCHEDULER_AUTOSTART=true. */
const SYNC_SCHEDULER_AUTOSTART = /^(true|1|yes)$/i.test(String(process.env.SYNC_SCHEDULER_AUTOSTART || ''));

const app = createApp();

app.listen(PORT, async () => {
  logger.info(`🌐 API server running at http://localhost:${PORT} (UI: Frontend on :5173)`);
  try {
    await testSequelize();
    logger.success('Database connection OK.');
  } catch (err) {
    logger.warn(`DB not reachable yet: ${err.message} (check DB_* env / run "npm run db:migrate")`);
  }
  // Register the scheduler (paused by default — never affects the current flow
  // until an admin resumes it from the Scheduler page or sets SCHEDULER_AUTOSTART).
  try {
    initScheduler({ startPaused: !SCHEDULER_AUTOSTART });
  } catch (err) {
    logger.warn(`Scheduler init skipped: ${err.message}`);
  }
  try {
    await initSyncScheduler({ startPaused: !SYNC_SCHEDULER_AUTOSTART });
  } catch (err) {
    logger.warn(`Sync scheduler init skipped: ${err.message}`);
  }
});
