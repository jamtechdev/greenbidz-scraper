/**
 * @file controllers/changes.controller.js
 * @description Change-detection review endpoints:
 *   GET  /api/changes          → synced products whose source content changed
 *   POST /api/changes/refresh  → re-scrape synced products to detect changes
 *   POST /api/changes/resync   → re-push changed products to the main site
 */
import {
  countChangedProducts,
  listChangedProducts,
  backfillSyncedBaseline,
} from '../database/queries.js';
import { startRefreshJob } from '../services/refreshJob.js';
import { resyncChanged } from '../services/changeDetection.js';

/** GET /api/changes?limit=&profile= — list products needing re-sync. */
export async function getChanges(req, res) {
  const limit = Number(req.query?.limit) || 100;
  const profile = req.query?.profile || null;
  const [count, products] = await Promise.all([
    countChangedProducts(),
    listChangedProducts({ limit, profile }),
  ]);
  return res.json({ count, products });
}

/** POST /api/changes/refresh { limit?, profile? } — kick off a refresh pass. */
export async function refreshChanges(req, res) {
  const limit = Number(req.body?.limit) || 50;
  const profile = req.body?.profile || null;
  const { jobId, count } = await startRefreshJob({ limit, profile });
  return res.json({ started: count > 0, jobId, count });
}

/**
 * POST /api/changes/resync { ids? } — re-sync changed products to the main site.
 * Delegates to the shared service (grouped by site_type+seller, dispatched via
 * the background sync job, which UPDATES products that already carry a main id).
 */
export async function resyncChanges(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
  const result = await resyncChanged(ids);
  return res.json(result);
}

/**
 * POST /api/changes/baseline — one-time baseline for already-synced products:
 * set synced_hash = content_hash where it's currently NULL. Lets pre-existing
 * synced products participate in change detection (treats the current scraped
 * content as the synced baseline). Run only when the main site matches source.
 */
export async function baselineChanges(req, res) {
  const updated = await backfillSyncedBaseline();
  return res.json({ updated });
}

export default { getChanges, refreshChanges, resyncChanges, baselineChanges };
