/**
 * @file controllers/syncRuns.controller.js — /api/sync/run(s), /api/sync/active
 *   Bulk, background, tracked syncing. Additive — does not touch the existing
 *   synchronous /api/sync/preview|submit endpoints.
 */
import {
  selectProductsForSync,
  listSyncCandidates,
  listSyncCandidateIds,
  listMappedMainCategories,
  createSyncRun,
  listSyncRuns,
  getSyncRunWithItems,
  listActiveSyncRuns,
  getFailedProductIds,
  getProductById,
} from '../database/queries.js';
import { readAllProfiles } from '../utils/file-manager.js';
import { buildBatch } from './sync.controller.js';
import { startSyncJob } from '../services/syncJob.js';
import { hasSystemKey } from '../services/syncSender.js';
import { getMarketplace, siteTypeFor } from '../config/sync-config.js';
import { getJob, cancelJob } from '../web/jobs.js';
import { logger } from '../utils/logger.js';

/** Map profile fileName → its configured price currency (default USD). */
async function profileCurrencyMap() {
  const map = {};
  try {
    for (const e of await readAllProfiles()) map[e.fileName] = e.profile?.priceCurrency || 'USD';
  } catch {
    /* profiles unavailable */
  }
  return map;
}

/** GET /api/sync/mapped-categories — distinct main categories that have a mapping. */
export async function getMappedCategories(req, res) {
  const categories = await listMappedMainCategories();
  res.json({ categories });
}

/** GET /api/sync/candidates — filtered, paginated product list for New Sync. */
export async function getSyncCandidates(req, res) {
  const { profile, titleContains, mainCategory } = req.query;
  const priceMin = req.query.priceMin;
  const priceMax = req.query.priceMax;
  const onlyUnsynced = req.query.onlyUnsynced !== 'false';
  const latestOnly = req.query.latestOnly === 'true';
  // limit: number caps the candidate pool; 'all'/empty → no cap.
  const rawLimit = req.query.limit;
  const limit = rawLimit == null || rawLimit === '' || rawLimit === 'all' ? null : Number(rawLimit);
  const offset = Number.parseInt(req.query.offset, 10) || 0;

  const { products, total } = await listSyncCandidates({
    profile: profile || undefined,
    priceMin,
    priceMax,
    titleContains,
    onlyUnsynced,
    latestOnly,
    mainCategory: mainCategory || undefined,
    limit,
    offset,
    pageSize: 50,
  });
  const cur = await profileCurrencyMap();
  const withCurrency = products.map((p) => ({ ...p, price_currency: cur[p.profile_file_name] || 'USD' }));
  res.json({ products: withCurrency, total });
}

/** GET /api/sync/candidate-ids — all matching product ids (for "select all"). */
export async function getSyncCandidateIds(req, res) {
  const { profile, titleContains, mainCategory } = req.query;
  const rawLimit = req.query.limit;
  const limit = rawLimit == null || rawLimit === '' || rawLimit === 'all' ? null : Number(rawLimit);
  const { ids, total } = await listSyncCandidateIds({
    profile: profile || undefined,
    priceMin: req.query.priceMin,
    priceMax: req.query.priceMax,
    titleContains,
    onlyUnsynced: req.query.onlyUnsynced !== 'false',
    latestOnly: req.query.latestOnly === 'true',
    mainCategory: mainCategory || undefined,
    limit,
  });
  res.json({ ids, total });
}

/** Resolve product ids from a filter object (selectProductsForSync passthrough). */
function filtersToOpts(filters = {}) {
  return {
    profile: filters.profile || undefined,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    titleContains: filters.titleContains,
    onlyUnsynced: filters.onlyUnsynced !== false, // default true
    latestOnly: !!filters.latestOnly,
    limit: filters.limit,
  };
}

/** POST /api/sync/run/preview — resolve filters → map → preview (+ resolvedIds). */
export async function postSyncRunPreview(req, res) {
  const { filters = {}, marketplace, sellerId, sellerName, country, overrides = {} } = req.body || {};
  if (!marketplace || !getMarketplace(marketplace)) {
    return res.status(400).json({ error: 'Valid marketplace required.' });
  }
  if (sellerId == null || Number.isNaN(Number(sellerId))) {
    return res.status(400).json({ error: 'Valid sellerId required.' });
  }

  const { ids, total: matched } = await selectProductsForSync(filtersToOpts(filters));
  if (!ids.length) {
    return res.json({
      marketplace,
      siteType: siteTypeFor(marketplace),
      seller: { id: Number(sellerId), displayName: sellerName || `Seller #${sellerId}` },
      country: country || '',
      matched,
      resolvedIds: [],
      total: 0,
      syncable: 0,
      blocked: 0,
      results: [],
    });
  }

  const batch = await buildBatch({ productIds: ids, marketplace, sellerId, sellerName, country, overrides });
  if (batch.error) return res.status(400).json({ error: batch.error });

  const syncable = batch.results.filter((r) => r.syncable).length;
  res.json({
    marketplace: batch.marketplace,
    siteType: siteTypeFor(batch.marketplace),
    seller: batch.seller,
    country: batch.country,
    matched, // total products that matched the filters (may exceed limit)
    resolvedIds: ids,
    total: batch.results.length,
    syncable,
    blocked: batch.results.length - syncable,
    results: batch.results,
  });
}

/** POST /api/sync/run — create a run + start the background job. */
export async function postSyncRun(req, res) {
  if (!hasSystemKey()) {
    return res.status(500).json({ error: 'MAIN_API_SYSTEM_KEY is not configured in the backend .env.' });
  }
  const { filters = {}, marketplace, sellerId, sellerName, country, overrides = {}, productIds } = req.body || {};
  if (!marketplace || !getMarketplace(marketplace)) {
    return res.status(400).json({ error: 'Valid marketplace required.' });
  }
  if (sellerId == null || Number.isNaN(Number(sellerId))) {
    return res.status(400).json({ error: 'Valid sellerId required.' });
  }

  // Prefer an explicit (possibly admin-edited) id list; else resolve from filters.
  let ids = Array.isArray(productIds) && productIds.length ? productIds.map(Number) : null;
  if (!ids) {
    const sel = await selectProductsForSync(filtersToOpts(filters));
    ids = sel.ids;
  }
  if (!ids.length) return res.status(400).json({ error: 'No products match the selected filters.' });

  const run = await createSyncRun({
    site_type: siteTypeFor(marketplace),
    profile: filters.profile || null,
    seller_id: Number(sellerId),
    seller_name: sellerName || null,
    country: country || null,
    filters_json: filters,
    trigger: 'manual',
    total: ids.length,
    status: 'processing',
  });

  const jobId = startSyncJob({ runId: run.id, productIds: ids, marketplace, sellerId, sellerName, country, overrides });
  logger.info(`⏫ Sync run ${run.id} started (${ids.length} product(s)) via UI.`);
  res.status(202).json({ ok: true, runId: run.id, jobId, total: ids.length });
}

/** GET /api/sync/runs?profile=&status=&order=&limit=&offset= */
export async function getSyncRuns(req, res) {
  const { profile, status, order } = req.query;
  const limit = Number.parseInt(req.query.limit, 10) || 50;
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const { runs, total } = await listSyncRuns({ profile: profile || undefined, status, order, limit, offset });
  res.json({ runs, total });
}

/** GET /api/sync/runs/:id — run + per-product items (with product titles). */
export async function getSyncRun(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid run id.' });
  const data = await getSyncRunWithItems(id);
  if (!data) return res.status(404).json({ error: 'Sync run not found.' });

  // Enrich items with a product title/url for display (best-effort).
  const items = await Promise.all(
    data.items.map(async (it) => {
      const p = await getProductById(it.product_id).catch(() => null);
      return { ...it, product_title: p?.title ?? null, product_url: p?.product_url ?? null };
    }),
  );
  res.json({ run: data.run, items });
}

/** GET /api/sync/active — in-progress runs, enriched with live job counters. */
export async function getActiveSyncRuns(req, res) {
  const runs = await listActiveSyncRuns();
  const active = runs.map((r) => {
    const job = r.job_id ? getJob(r.job_id) : null;
    return {
      id: r.id,
      runId: r.id,
      jobId: r.job_id,
      siteType: r.site_type,
      profile: r.profile,
      total: r.total,
      success: job ? job.scraped || 0 : r.success_count,
      failed: job ? job.failed || 0 : r.failed_count,
      status: r.status,
      startedAt: r.created_at,
    };
  });
  res.json({ active });
}

/** POST /api/sync/runs/:id/resync-failed — new run over this run's failed products. */
export async function postResyncFailed(req, res) {
  if (!hasSystemKey()) {
    return res.status(500).json({ error: 'MAIN_API_SYSTEM_KEY is not configured in the backend .env.' });
  }
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid run id.' });
  const data = await getSyncRunWithItems(id);
  if (!data) return res.status(404).json({ error: 'Sync run not found.' });

  const ids = await getFailedProductIds(id);
  if (!ids.length) return res.status(400).json({ error: 'No failed products to resync in this run.' });

  const src = data.run;
  const marketplace = src.site_type; // getMarketplace resolves by site_type too
  const run = await createSyncRun({
    site_type: src.site_type,
    profile: src.profile,
    seller_id: src.seller_id,
    seller_name: src.seller_name,
    country: src.country,
    filters_json: src.filters_json,
    trigger: 'resync',
    total: ids.length,
    status: 'processing',
  });
  const jobId = startSyncJob({
    runId: run.id,
    productIds: ids,
    marketplace,
    sellerId: src.seller_id,
    sellerName: src.seller_name,
    country: src.country,
  });
  logger.info(`⏫ Resync run ${run.id} started from run ${id} (${ids.length} failed product(s)).`);
  res.status(202).json({ ok: true, runId: run.id, jobId, total: ids.length });
}

/** POST /api/sync/runs/:id/cancel — request cancellation of a running job. */
export async function postCancelSyncRun(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid run id.' });
  const data = await getSyncRunWithItems(id);
  if (!data) return res.status(404).json({ error: 'Sync run not found.' });
  if (data.run.status !== 'processing') {
    return res.status(409).json({ error: `Run is not running (status: ${data.run.status}).` });
  }
  const ok = data.run.job_id ? cancelJob(data.run.job_id) : false;
  res.json({ ok });
}
