/**
 * @file scheduler/scheduler-manager.js
 * @description Single source of truth for the background crawl scheduler. Owns
 *   the node-cron task, tracks live status (paused / busy / last run), and
 *   exposes control actions (run-now, pause, resume) for the /api/scheduler
 *   endpoints. State is in-memory (resets on server restart) EXCEPT per-profile
 *   due-ness, which is derived from the persisted crawl_history — so a restart
 *   does not change when each profile next runs.
 *
 *   Unlike the old single global interval, there is NO global "every Nh" cadence.
 *   A fixed 5-minute base tick checks every "with job" (scrapeMode === 'auto',
 *   not paused) profile and crawls the ones whose OWN interval
 *   (`scrapeIntervalMinutes`, default CRAWL_DEFAULT_INTERVAL_MINUTES) has elapsed
 *   since that profile's last scrape (added time as fallback). Profiles thus run
 *   on independent cadences and naturally stagger.
 */
import cron from 'node-cron';
import { runAllAutoProfiles } from './job-runner.js';
import { readAllProfiles } from '../utils/file-manager.js';
import { getLastCrawlTimes } from '../database/queries.js';
import { intervalMinutesOf, nextRunMs, lastScrapeMsOf } from './schedule-util.js';
import { logger } from '../utils/logger.js';

const POLL = '*/5 * * * *'; // base tick every 5 min (finest profile interval is 20m)

const state = {
  task: null, // node-cron ScheduledTask
  started: false, // initScheduler() has run
  paused: false, // admin paused the recurring job (master switch)
  busy: false, // a crawl cycle is running right now
  lastRunAt: null, // ISO string of last completed cycle
  lastError: null, // last cycle error message, if any
  lastSummary: null, // aggregated counts from the last cycle
};

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
 * @param {string} trigger - 'cron' (only due profiles) | 'manual' (all profiles).
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
    const summaries = await runAllAutoProfiles({ onlyDue: trigger === 'cron' });
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
 * immediately; the first cycle fires at the next 5-minute tick.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.startPaused=false] - Register the schedule but keep it
 *   paused so nothing auto-crawls until the admin resumes it.
 */
export function initScheduler({ startPaused = false } = {}) {
  if (state.started) return;
  state.paused = startPaused;
  state.task = cron.schedule(POLL, () => {
    if (state.paused) return;
    runCycle('cron');
  });
  if (state.paused && state.task) state.task.stop();
  state.started = true;
  logger.info(
    `⏰ Scheduler initialised — checks every 5 min, per-profile intervals ` +
      `(${state.paused ? 'paused' : 'active'}).`,
  );
}

/** Trigger a crawl cycle immediately (in the background) — runs ALL auto profiles. */
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

/** Current scheduler status + the auto-profiles it will crawl (with per-profile timing). */
export async function getStatus() {
  let autoProfiles = [];
  let lastByUrl = new Map();
  try {
    for (const row of await getLastCrawlTimes()) lastByUrl.set(row.listing_url, row.last_timestamp);
  } catch {
    lastByUrl = new Map();
  }
  const now = Date.now();

  try {
    const all = await readAllProfiles();
    autoProfiles = all
      .filter((e) => e.profile && e.profile.scrapeMode === 'auto')
      .map((e) => {
        const paused = !!e.profile.paused;
        const last = lastScrapeMsOf(e.profile, lastByUrl);
        const next = !state.paused && !paused ? nextRunMs(e.profile, lastByUrl, e.createdAt, now) : null;
        return {
          fileName: e.fileName,
          profileName: e.profile.profileName ?? e.fileName,
          domain: e.profile.domain ?? null,
          paused,
          intervalMinutes: intervalMinutesOf(e.profile),
          listingUrlCount: Array.isArray(e.profile.listingUrls)
            ? e.profile.listingUrls.filter(Boolean).length
            : 0,
          scrapeLimit: e.profile.scrapeLimit ?? null,
          lastRunAt: last != null ? new Date(last).toISOString() : null,
          nextRunAt: next != null ? new Date(next).toISOString() : null,
        };
      });
  } catch {
    /* profiles unavailable */
  }

  const activeCount = autoProfiles.filter((p) => !p.paused && p.listingUrlCount > 0).length;
  // Header "next run" = earliest upcoming active-profile run.
  const upcoming = autoProfiles
    .map((p) => p.nextRunAt)
    .filter(Boolean)
    .sort();

  return {
    started: state.started,
    running: state.started && !state.paused, // schedule is active
    paused: state.paused,
    busy: state.busy, // a cycle is executing now
    pollExpression: POLL,
    nextRunAt: state.paused ? null : upcoming[0] ?? null,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
    activeProfileCount: activeCount,
    autoProfiles,
  };
}

export default { initScheduler, runNow, pause, resume, getStatus };
