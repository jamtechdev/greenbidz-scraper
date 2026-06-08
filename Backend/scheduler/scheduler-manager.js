/**
 * @file scheduler/scheduler-manager.js
 * @description Single source of truth for the background crawl scheduler. Owns
 *   the node-cron task, tracks live status (paused / busy / last run / next run),
 *   and exposes control actions (run-now, pause, resume) for the /api/scheduler
 *   endpoints. State is in-memory (resets on server restart).
 *
 *   The schedule mirrors the original job-runner: every CRAWL_INTERVAL_HOURS, on
 *   the hour, it crawls every profile marked "with job" (scrapeMode === 'auto',
 *   not paused) via runAllAutoProfiles().
 */
import cron from 'node-cron';
import { runAllAutoProfiles } from './job-runner.js';
import { readAllProfiles } from '../utils/file-manager.js';
import { CONSTANTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

const state = {
  task: null, // node-cron ScheduledTask
  started: false, // initScheduler() has run
  paused: false, // admin paused the recurring job
  busy: false, // a crawl cycle is running right now
  intervalHours: CONSTANTS.CRAWL_INTERVAL_HOURS,
  lastRunAt: null, // ISO string of last completed cycle
  lastError: null, // last cycle error message, if any
  lastSummary: null, // aggregated counts from the last cycle
};

/** Cron expression: minute 0, every N hours. */
function expression() {
  return `0 */${state.intervalHours} * * *`;
}

/**
 * Next fire time for the cron (minute 0, every N hours): the next top-of-hour
 * whose hour is a multiple of N and is strictly in the future. Null when paused.
 * @returns {Date | null}
 */
function computeNextRun() {
  if (state.paused) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  while (next <= now || next.getHours() % state.intervalHours !== 0) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}

/** Aggregate runAllAutoProfiles() per-listing summaries into headline counts. */
function summarize(summaries) {
  const list = Array.isArray(summaries) ? summaries : [];
  return list.reduce(
    (acc, s) => {
      acc.listings += 1;
      acc.found += s.found ?? 0;
      acc.new += s.newCount ?? 0;
      acc.scraped += s.scrapedCount ?? 0;
      acc.failed += s.failed ?? 0;
      if (s.error) acc.errors += 1;
      return acc;
    },
    { listings: 0, found: 0, new: 0, scraped: 0, failed: 0, errors: 0 },
  );
}

/**
 * Run one crawl cycle (guarded so two never overlap). Records last-run state.
 * @param {string} trigger - 'cron' | 'manual' (for logging).
 * @returns {Promise<{ ran: boolean, reason?: string }>}
 */
async function runCycle(trigger) {
  if (state.busy) {
    logger.warn(`Scheduler: a crawl is already running — ${trigger} run skipped.`);
    return { ran: false, reason: 'busy' };
  }
  state.busy = true;
  state.lastError = null;
  logger.info(`⏰ Scheduler: starting ${trigger} crawl cycle.`);
  try {
    const summaries = await runAllAutoProfiles();
    state.lastSummary = summarize(summaries);
    state.lastRunAt = new Date().toISOString();
    logger.info(
      `⏰ Scheduler cycle done — ${state.lastSummary.listings} listing(s), ` +
        `${state.lastSummary.new} new, ${state.lastSummary.scraped} scraped, ${state.lastSummary.failed} failed.`,
    );
    return { ran: true };
  } catch (err) {
    state.lastError = err.message;
    state.lastRunAt = new Date().toISOString();
    logger.error(`Scheduler cycle failed: ${err.message}`, { stack: err.stack });
    return { ran: true };
  } finally {
    state.busy = false;
  }
}

/**
 * Create the cron task. Idempotent — safe to call once on boot. Does NOT run
 * immediately; the first cycle fires at the next cron tick.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.startPaused=false] - Register the schedule but keep it
 *   paused so nothing auto-crawls until the admin resumes it (preserves the
 *   prior behaviour, where the scheduler never ran).
 */
export function initScheduler({ startPaused = false } = {}) {
  if (state.started) return;
  state.paused = startPaused;
  state.task = cron.schedule(expression(), () => {
    if (state.paused) return;
    runCycle('cron');
  });
  if (state.paused && state.task) state.task.stop();
  state.started = true;
  logger.info(
    `⏰ Scheduler initialised — every ${state.intervalHours}h [cron: "${expression()}"] ` +
      `(${state.paused ? 'paused' : 'active'}).`,
  );
}

/** Trigger a crawl cycle immediately (in the background). */
export function runNow() {
  if (state.busy) return { started: false, reason: 'A crawl is already running.' };
  runCycle('manual'); // fire-and-forget; status reflects busy=true
  return { started: true };
}

/** Pause the recurring schedule (manual run-now still works). */
export function pause() {
  state.paused = true;
  if (state.task) state.task.stop();
  logger.info('⏰ Scheduler paused.');
  return getStatus();
}

/** Resume the recurring schedule. */
export function resume() {
  state.paused = false;
  if (state.task) state.task.start();
  logger.info('⏰ Scheduler resumed.');
  return getStatus();
}

/** Current scheduler status + the auto-profiles it will crawl. */
export async function getStatus() {
  let autoProfiles = [];
  try {
    const all = await readAllProfiles();
    autoProfiles = all
      .filter((e) => e.profile && e.profile.scrapeMode === 'auto')
      .map((e) => ({
        fileName: e.fileName,
        profileName: e.profile.profileName ?? e.fileName,
        domain: e.profile.domain ?? null,
        paused: !!e.profile.paused,
        listingUrlCount: Array.isArray(e.profile.listingUrls)
          ? e.profile.listingUrls.filter(Boolean).length
          : 0,
        scrapeLimit: e.profile.scrapeLimit ?? null,
      }));
  } catch {
    /* profiles unavailable */
  }

  const nextRun = computeNextRun();
  const activeCount = autoProfiles.filter((p) => !p.paused && p.listingUrlCount > 0).length;

  return {
    started: state.started,
    running: state.started && !state.paused, // schedule is active
    paused: state.paused,
    busy: state.busy, // a cycle is executing now
    intervalHours: state.intervalHours,
    expression: expression(),
    nextRunAt: nextRun ? nextRun.toISOString() : null,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
    activeProfileCount: activeCount,
    autoProfiles,
  };
}

export default { initScheduler, runNow, pause, resume, getStatus };
