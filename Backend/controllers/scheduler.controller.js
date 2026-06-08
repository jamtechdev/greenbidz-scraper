/**
 * @file controllers/scheduler.controller.js — /api/scheduler
 *   Status + controls for the background crawl scheduler. Purely additive: it
 *   reads/controls scheduler-manager and does not touch any other flow.
 */
import {
  getStatus,
  runNow,
  pause,
  resume,
} from '../scheduler/scheduler-manager.js';
import { logger } from '../utils/logger.js';

/** GET /api/scheduler — current status + the auto-profiles it crawls. */
export async function getScheduler(req, res) {
  res.json(await getStatus());
}

/** POST /api/scheduler/run — trigger a crawl cycle now (background). */
export async function postSchedulerRun(req, res) {
  const result = runNow();
  if (!result.started) return res.status(409).json({ error: result.reason || 'Already running.' });
  logger.info('⏰ Scheduler run-now triggered via UI.');
  res.json({ ok: true, ...(await getStatus()) });
}

/** POST /api/scheduler/pause — pause the recurring schedule. */
export async function postSchedulerPause(req, res) {
  res.json({ ok: true, ...(await pause()) });
}

/** POST /api/scheduler/resume — resume the recurring schedule. */
export async function postSchedulerResume(req, res) {
  res.json({ ok: true, ...(await resume()) });
}
