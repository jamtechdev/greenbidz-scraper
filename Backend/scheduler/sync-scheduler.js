/**
 * @file scheduler/sync-scheduler.js
 * @description Recurring auto-sync with PER-TARGET intervals. A single hourly
 * base tick checks every configured target and runs the ones whose own interval
 * has elapsed since they last ran. The scheduler itself only has a global
 * pause/resume — there is no global interval; each target carries its own
 * `intervalHours` (1/2/5/10/24/120). Starts paused so nothing auto-runs until
 * an admin enables it.
 *
 * Per-target last-run times are kept in memory (keyed by profile|marketplace|
 * seller), so after a restart every enabled target is treated as due on the
 * first tick — harmless because sync only ever touches still-unsynced products.
 */
import cron from 'node-cron';
import { getSyncSettings, saveSyncSettings, selectProductsForSync, createSyncRun } from '../database/queries.js';
import { startSyncJob } from '../services/syncJob.js';
import { siteTypeFor, getMarketplace } from '../config/sync-config.js';
import { logger } from '../utils/logger.js';

const POLL = '0 * * * *'; // hourly base tick (finest target interval is 1h)
const HOUR_MS = 3600 * 1000;

const state = {
  task: null,
  started: false,
  paused: true,
  busy: false,
  lastRunAt: null,
  lastError: null,
  lastSummary: null,
  config: { enabled: false, targets: [] },
};

/** Stable identity for a target's last-run tracking. */
function targetKey(t) {
  const profile = t.filters?.profile ?? t.profile ?? '';
  return `${profile}|${t.marketplace}|${t.sellerId}`;
}

/** epoch ms of the last run per target key (in-memory). */
const lastRunByKey = new Map();

function intervalHoursOf(t) {
  return Math.max(1, Number(t.intervalHours) || 2);
}

function isDue(t, now) {
  const last = lastRunByKey.get(targetKey(t));
  if (last == null) return true; // never run this session → due
  return now - last >= intervalHoursOf(t) * HOUR_MS;
}

/** Display-only next-run estimate for a target. */
function nextRunForTarget(t) {
  if (state.paused) return null;
  const last = lastRunByKey.get(targetKey(t));
  if (last == null) {
    // Will run on the next hourly tick.
    const n = new Date();
    n.setMinutes(0, 0, 0);
    n.setHours(n.getHours() + 1);
    return n;
  }
  return new Date(last + intervalHoursOf(t) * HOUR_MS);
}

/** Start a sync run for one target. Returns product count started (0 if none). */
async function runTarget(t) {
  if (!t?.marketplace || !getMarketplace(t.marketplace) || t.sellerId == null) return 0;
  const { ids } = await selectProductsForSync({
    ...(t.filters || {}),
    profile: t.filters?.profile ?? t.profile,
  });
  if (!ids.length) return 0;
  const run = await createSyncRun({
    site_type: siteTypeFor(t.marketplace),
    profile: t.filters?.profile ?? t.profile ?? null,
    seller_id: Number(t.sellerId),
    seller_name: t.sellerName || null,
    country: t.country || null,
    filters_json: t.filters || {},
    trigger: 'scheduled',
    total: ids.length,
    status: 'processing',
  });
  startSyncJob({
    runId: run.id,
    productIds: ids,
    marketplace: t.marketplace,
    sellerId: t.sellerId,
    sellerName: t.sellerName,
    country: t.country,
  });
  return ids.length;
}

/**
 * One scheduler pass. `trigger`:
 *  - 'cron'   → run only targets whose own interval has elapsed.
 *  - 'manual' → run every target now (the "Run now" button), ignoring intervals.
 */
async function runCycle(trigger) {
  if (state.busy) {
    logger.warn(`Sync scheduler: previous pass still running — ${trigger} skipped.`);
    return { ran: false, reason: 'busy' };
  }
  state.busy = true;
  state.lastError = null;
  try {
    const cfg = await getSyncSettings();
    const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
    const now = Date.now();
    let runs = 0;
    let products = 0;
    for (const t of targets) {
      if (trigger === 'cron' && !isDue(t, now)) continue;
      // eslint-disable-next-line no-await-in-loop
      const n = await runTarget(t);
      if (n > 0) {
        runs += 1;
        products += n;
      }
      // Mark as run regardless (so an empty/invalid target waits its interval too).
      lastRunByKey.set(targetKey(t), now);
    }
    state.lastRunAt = new Date().toISOString();
    state.lastSummary = { runs, products };
    if (runs > 0) logger.info(`⏰ Sync scheduler (${trigger}) — started ${runs} run(s) over ${products} product(s).`);
    return { ran: true };
  } catch (err) {
    state.lastError = err.message;
    state.lastRunAt = new Date().toISOString();
    logger.error(`Sync scheduler pass failed: ${err.message}`);
    return { ran: true };
  } finally {
    state.busy = false;
  }
}

function rebuildTask() {
  if (state.task) {
    state.task.stop();
    state.task = null;
  }
  state.task = cron.schedule(POLL, () => {
    if (!state.paused) runCycle('cron');
  });
  if (state.paused) state.task.stop();
}

export async function initSyncScheduler({ startPaused = true } = {}) {
  if (state.started) return;
  try {
    const cfg = await getSyncSettings();
    state.config = { enabled: false, targets: [], ...(cfg || {}) };
  } catch {
    /* settings unavailable — defaults */
  }
  state.paused = startPaused || !state.config.enabled;
  rebuildTask();
  state.started = true;
  logger.info(`⏰ Sync scheduler initialised — hourly check, per-target intervals (${state.paused ? 'paused' : 'active'}).`);
}

export function runNow() {
  if (state.busy) return { started: false, reason: 'A sync pass is already running.' };
  runCycle('manual');
  return { started: true };
}

export function pause() {
  state.paused = true;
  if (state.task) state.task.stop();
  logger.info('⏰ Sync scheduler paused.');
  return getStatus();
}

export function resume() {
  state.paused = false;
  if (state.task) state.task.start();
  logger.info('⏰ Sync scheduler resumed.');
  return getStatus();
}

/** Save config (enabled + per-target intervals/filters) and arm pause state. */
export async function setConfig(config) {
  const next = {
    enabled: !!config?.enabled,
    targets: Array.isArray(config?.targets) ? config.targets : [],
  };
  await saveSyncSettings(next);
  state.config = next;
  state.paused = !next.enabled;
  rebuildTask();
  return getStatus();
}

export function getStatus() {
  const targets = Array.isArray(state.config.targets) ? state.config.targets : [];
  const targetRuns = targets.map((t) => {
    const last = lastRunByKey.get(targetKey(t));
    const next = nextRunForTarget(t);
    return {
      intervalHours: intervalHoursOf(t),
      lastRunAt: last != null ? new Date(last).toISOString() : null,
      nextRunAt: next ? next.toISOString() : null,
    };
  });
  // Header "next run" = earliest upcoming target run.
  const upcoming = targetRuns.map((r) => r.nextRunAt).filter(Boolean).sort();
  return {
    started: state.started,
    running: state.started && !state.paused,
    paused: state.paused,
    busy: state.busy,
    pollExpression: POLL,
    nextRunAt: state.paused ? null : upcoming[0] ?? null,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
    config: state.config,
    targetRuns,
  };
}

export default { initSyncScheduler, runNow, pause, resume, setConfig, getStatus };
