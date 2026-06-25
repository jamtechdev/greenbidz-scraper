/**
 * @file controllers/refreshScheduler.controller.js
 * @description Control endpoints for the change-detection refresh scheduler.
 */
import * as refresh from '../scheduler/refresh-scheduler.js';

/** GET /api/refresh-scheduler/status */
export async function status(req, res) {
  return res.json(refresh.getStatus());
}

/** POST /api/refresh-scheduler/run-now */
export async function runNow(req, res) {
  return res.json(refresh.runNow());
}

/** POST /api/refresh-scheduler/pause */
export async function pause(req, res) {
  return res.json(refresh.pause());
}

/** POST /api/refresh-scheduler/resume */
export async function resume(req, res) {
  return res.json(refresh.resume());
}

/** POST /api/refresh-scheduler/config { intervalHours?, batchSize?, autoResync? } */
export async function config(req, res) {
  return res.json(refresh.setConfig(req.body || {}));
}

export default { status, runNow, pause, resume, config };
