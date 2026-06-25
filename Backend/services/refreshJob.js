/**
 * @file services/refreshJob.js
 * @description Change-detection refresh pass. Re-scrapes already-synced products
 *   (oldest-checked first, a small batch at a time) so source-side changes are
 *   picked up. Re-scraping recomputes products.content_hash; when it diverges
 *   from synced_hash the product surfaces via listChangedProducts().
 *
 *   This deliberately reuses the existing tracked rescrape job, so it shows up in
 *   the same job registry and never competes heavily with new-product discovery.
 */
import { listSyncedProductIdsForRefresh } from '../database/queries.js';
import { startRescrapeJob } from './rescrapeJob.js';
import { logger } from '../utils/logger.js';

/**
 * Start a refresh pass over already-synced products.
 * @param {object} [opts]
 * @param {number} [opts.limit=50] - Max products to re-scrape this pass.
 * @param {string|null} [opts.profile] - Restrict to one profile_file_name.
 * @returns {Promise<{ jobId: string|null, count: number }>}
 */
export async function startRefreshJob({ limit = 50, profile = null } = {}) {
  const ids = await listSyncedProductIdsForRefresh({ limit, profile });
  if (!ids.length) {
    logger.info('Refresh pass: no synced products to re-check.');
    return { jobId: null, count: 0 };
  }
  logger.info(`🔄 Refresh pass: re-scraping ${ids.length} synced product(s) to detect changes.`);
  const jobId = startRescrapeJob(ids);
  return { jobId, count: ids.length };
}

export default { startRefreshJob };
