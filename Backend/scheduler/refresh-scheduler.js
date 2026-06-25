/**
 * @file scheduler/refresh-scheduler.js
 * @description Recurring change-detection. On its interval it re-scrapes a batch
 *   of already-synced products (oldest-checked first) to detect source-side
 *   changes, then OPTIONALLY auto-re-syncs the changed ones to the main site.
 *
 *   Config is in-memory (resets to env defaults on restart) and the scheduler
 *   starts PAUSED, so it never re-scrapes or pushes anything until an admin
 *   enables it. A single busy guard prevents overlapping passes.
 *
 *   Env defaults: REFRESH_INTERVAL_HOURS (24), REFRESH_BATCH (50),
 *   REFRESH_AUTO_RESYNC (false), REFRESH_AUTOSTART (false).
 */
import cron from 'node-cron';
import { runRefreshPass, resyncChanged } from '../services/changeDetection.js';
import { countChangedProducts } from '../database/queries.js';
import { logger } from '../utils/logger.js';

const POLL = '0 * * * *'; // hourly base tick; runs when intervalHours has elapsed
const HOUR_MS = 3600 * 1000;

function intEnv(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}
function boolEnv(v) {
  return /^(true|1|yes)$/i.test(String(v || ''));
}

const state = {
  task: null,
  started: false,
  paused: true,
  busy: false,
  lastRunAt: null,
  lastError: null,
  lastSummary: null,
  lastTickMs: 0,
  config: {
    intervalHours: intEnv(process.env.REFRESH_INTERVAL_HOURS, 24),
    batchSize: intEnv(process.env.REFRESH_BATCH, 50),
    autoResync: boolEnv(process.env.REFRESH_AUTO_RESYNC),
  },
};

/** Run one refresh (+ optional auto-resync) pass, guarded against overlap. */
async function runCycle(trigger) {
  if (state.busy) {
    logger.warn(`Refresh scheduler: previous pass still running — ${trigger} skipped.`);
    return { ran: false, reason: 'busy' };
  }
  state.busy = true;
  state.lastError = null;
  try {
    const refreshed = await runRefreshPass({ limit: state.config.batchSize });
    let resync = null;
    if (state.config.autoResync) {
      const changed = await countChangedProducts();
      if (changed > 0) resync = await resyncChanged();
    }
    state.lastRunAt = new Date().toISOString();
    state.lastTickMs = Date.now();
    state.lastSummary = {
      refreshed: refreshed.scraped,
      failed: refreshed.failed,
      checked: refreshed.count,
      resyncRuns: resync?.started ?? 0,
    };
    logger.info(
      `🔄 Refresh cycle (${trigger}) — ${refreshed.scraped} re-scraped, ` +
        `${state.lastSummary.resyncRuns} resync run(s).`,
    );
    return { ran: true };
  } catch (err) {
    state.lastError = err.message;
    state.lastRunAt = new Date().toISOString();
    state.lastTickMs = Date.now();
    logger.error(`Refresh cycle failed: ${err.message}`, { stack: err.stack });
    return { ran: true };
  } finally {
    state.busy = false;
  }
}

/** True when the configured interval has elapsed since the last tick. */
function isDue() {
  if (!state.lastTickMs) return true;
  return Date.now() - state.lastTickMs >= state.config.intervalHours * HOUR_MS;
}

export function initRefreshScheduler({ startPaused = true } = {}) {
  if (state.started) return;
  state.paused = startPaused;
  state.task = cron.schedule(POLL, () => {
    if (state.paused || !isDue()) return;
    runCycle('cron');
  });
  if (state.paused && state.task) state.task.stop();
  state.started = true;
  logger.info(
    `🔄 Refresh scheduler initialised — every ${state.config.intervalHours}h, ` +
      `batch ${state.config.batchSize}, auto-resync ${state.config.autoResync} (${state.paused ? 'paused' : 'active'}).`,
  );
}

export function runNow() {
  if (state.busy) return { started: false, reason: 'A refresh pass is already running.' };
  runCycle('manual');
  return { started: true };
}

export function pause() {
  state.paused = true;
  if (state.task) state.task.stop();
  logger.info('🔄 Refresh scheduler paused.');
  return getStatus();
}

export function resume() {
  state.paused = false;
  if (state.task) state.task.start();
  logger.info('🔄 Refresh scheduler resumed.');
  return getStatus();
}

/** Update config (intervalHours, batchSize, autoResync). */
export function setConfig(patch = {}) {
  const next = { ...state.config };
  if (patch.intervalHours != null) next.intervalHours = Math.max(1, Number(patch.intervalHours) || next.intervalHours);
  if (patch.batchSize != null) next.batchSize = Math.max(1, Math.min(1000, Number(patch.batchSize) || next.batchSize));
  if (patch.autoResync != null) next.autoResync = !!patch.autoResync;
  state.config = next;
  return getStatus();
}

export function getStatus() {
  return {
    started: state.started,
    running: state.started && !state.paused,
    paused: state.paused,
    busy: state.busy,
    pollExpression: POLL,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
    config: state.config,
  };
}

export default { initRefreshScheduler, runNow, pause, resume, setConfig, getStatus };
