/**
 * @file services/changeDetection.js
 * @description Shared change-detection operations used by both the HTTP
 *   endpoints (controllers/changes.controller.js) and the recurring refresh
 *   scheduler (scheduler/refresh-scheduler.js):
 *
 *     runRefreshPass()  — re-scrape a batch of already-synced products INLINE
 *                         (awaitable) so callers can chain detection/resync.
 *     resyncChanged()   — re-push changed products to the main site, grouped by
 *                         site_type + seller, via the existing sync-job runner.
 */
import {
  listSyncedProductIdsForRefresh,
  listChangedProducts,
  getProductById,
  createSyncRun,
} from '../database/queries.js';
import { processProductUrl } from '../scheduler/job-runner.js';
import { startSyncJob } from './syncJob.js';
import { readProfile, profileExists } from '../utils/file-manager.js';
import { launchBrowser, closeBrowser } from '../config/puppeteer.js';
import { getMarketplace, siteTypeFor } from '../config/sync-config.js';
import { logger } from '../utils/logger.js';

/**
 * Re-scrape a batch of already-synced products (oldest-checked first) so a later
 * change comparison can run. Inline + awaitable. Re-scraping recomputes
 * products.content_hash; divergence from synced_hash surfaces in listChangedProducts.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @param {string|null} [opts.profile]
 * @param {() => boolean} [opts.shouldStop]
 * @returns {Promise<{ scraped: number, failed: number, count: number }>}
 */
export async function runRefreshPass({ limit = 50, profile = null, shouldStop } = {}) {
  const ids = await listSyncedProductIdsForRefresh({ limit, profile });
  if (!ids.length) return { scraped: 0, failed: 0, count: 0 };

  const browser = await launchBrowser();
  let scraped = 0;
  let failed = 0;
  try {
    for (const id of ids) {
      if (shouldStop?.()) break;
      // eslint-disable-next-line no-await-in-loop
      const product = await getProductById(id).catch(() => null);
      if (!product || !product.product_url) {
        failed += 1;
        continue;
      }
      let forced = null;
      const fn = product.profile_file_name;
      if (fn) {
        try {
          // eslint-disable-next-line no-await-in-loop
          if (await profileExists(fn)) forced = { fileName: fn, profile: await readProfile(fn) };
        } catch {
          /* fall back to auto-resolve */
        }
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await processProductUrl(product.product_url, browser, forced ? { forcedProfile: forced } : {});
        if (r.status === 'saved') scraped += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        logger.warn(`Refresh re-scrape failed for ${product.product_url}: ${err.message}`);
      }
    }
  } finally {
    await closeBrowser(browser);
  }
  logger.info(`🔄 Refresh pass complete — ${scraped} re-scraped, ${failed} failed of ${ids.length}.`);
  return { scraped, failed, count: ids.length };
}

/**
 * Re-sync changed products to the main site. Groups by (site_type, seller) and
 * dispatches each group via the background sync job, which UPDATES products that
 * already carry a main id (PATCH) and clears the "changed" state on success.
 *
 * @param {number[]} [ids] - Restrict to these product ids; omit for all changed.
 * @returns {Promise<{ started: number, runs: object[], skipped: object[] }>}
 */
export async function resyncChanged(ids) {
  const requested = Array.isArray(ids)
    ? new Set(ids.map(Number).filter(Number.isInteger))
    : null;

  let changed = await listChangedProducts({ limit: 1000 });
  if (requested) changed = changed.filter((p) => requested.has(Number(p.id)));
  if (!changed.length) return { started: 0, runs: [], skipped: [] };

  const groups = new Map();
  for (const p of changed) {
    const key = `${p.main_site_type}|${p.main_seller_id ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const runs = [];
  const skipped = [];
  for (const [, items] of groups) {
    const first = items[0];
    const marketplace = getMarketplace(first.main_site_type);
    if (!marketplace || first.main_seller_id == null) {
      skipped.push({ siteType: first.main_site_type, count: items.length, reason: 'unknown marketplace or seller' });
      continue;
    }
    const productIds = items.map((p) => Number(p.id));
    // eslint-disable-next-line no-await-in-loop
    const run = await createSyncRun({
      site_type: siteTypeFor(marketplace.name),
      profile: null,
      seller_id: Number(first.main_seller_id),
      seller_name: first.main_seller_name || null,
      country: null,
      filters_json: { source: 'resync-changed' },
      trigger: 'manual',
      total: productIds.length,
      status: 'processing',
    });
    const jobId = startSyncJob({
      runId: run.id,
      productIds,
      marketplace: marketplace.name,
      sellerId: Number(first.main_seller_id),
      sellerName: first.main_seller_name || undefined,
      country: undefined,
    });
    runs.push({ runId: run.id, jobId, marketplace: marketplace.name, count: productIds.length });
  }

  logger.info(`🔁 Re-sync changed: started ${runs.length} run(s) over ${changed.length} product(s).`);
  return { started: runs.length, runs, skipped };
}

export default { runRefreshPass, resyncChanged };
