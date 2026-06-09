/**
 * @file controllers/syncScheduler.controller.js — /api/sync/scheduler
 *   Status + controls for the recurring auto-sync. Additive; reads/controls
 *   scheduler/sync-scheduler.js only.
 */
import { getStatus, runNow, pause, resume, setConfig } from '../scheduler/sync-scheduler.js';
import { logger } from '../utils/logger.js';

export function getSyncScheduler(req, res) {
  res.json(getStatus());
}

export function postSyncSchedulerRun(req, res) {
  const result = runNow();
  if (!result.started) return res.status(409).json({ error: result.reason || 'Already running.' });
  logger.info('⏰ Sync scheduler run-now triggered via UI.');
  res.json({ ok: true, ...getStatus() });
}

export function postSyncSchedulerPause(req, res) {
  res.json({ ok: true, ...pause() });
}

export function postSyncSchedulerResume(req, res) {
  res.json({ ok: true, ...resume() });
}

export async function postSyncSchedulerConfig(req, res) {
  const status = await setConfig(req.body || {});
  res.json({ ok: true, ...status });
}
