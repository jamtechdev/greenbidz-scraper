/**
 * @file services/syncSender.js
 * @description The main-site create-grouped-listings POST, extracted from
 * sync.controller.submitSync so both the synchronous endpoint and the
 * background sync-job runner share identical request mechanics. Behavior is
 * unchanged from the original inline implementation.
 */
import { logger } from '../utils/logger.js';
import { SYNC_DEFAULTS } from '../config/sync-config.js';

const MAIN_API_BASE_URL = process.env.MAIN_API_BASE_URL || 'https://api.101recycle.greenbidz.com';
const MAIN_API_SYSTEM_KEY = process.env.MAIN_API_SYSTEM_KEY || '';

/** Whether the backend is configured to talk to the main API. */
export function hasSystemKey() {
  return !!MAIN_API_SYSTEM_KEY;
}

/**
 * POST a set of mapped products to the main site's create-grouped-listings API.
 *
 * @param {object} args
 * @param {string} args.siteType - x-platform value.
 * @param {object[]} args.results - mapProduct() results (each has .mapped, .images, .productId).
 * @param {string} args.country
 * @param {{ id: number }} args.seller
 * @returns {Promise<{
 *   ok: boolean, status: number, data: any,
 *   mainIdByProductId: Record<number, number>, error?: string
 * }>}
 *   ok=false with error set on network failure (status 0) or upstream non-2xx.
 */
export async function postGroupedListings({ siteType, results, country, seller }) {
  const productsJson = results.map((r) => r.mapped);
  const imageUrlsJson = results.map((r) => r.images);

  const fd = new FormData();
  fd.append('products_json', JSON.stringify(productsJson));
  fd.append('auction_group_json', JSON.stringify({ country }));
  fd.append('seller_id', String(seller.id));
  fd.append('country', country);
  fd.append('visibility', SYNC_DEFAULTS.visibility);
  fd.append('from_agent', String(SYNC_DEFAULTS.from_agent));
  fd.append('image_urls_json', JSON.stringify(imageUrlsJson));

  const url = `${MAIN_API_BASE_URL}/api/v1/wp/create-grouped-listings?lang=en`;
  logger.info(`↗️  Syncing ${productsJson.length} product(s) to main site (${siteType})`);

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'x-system-key': MAIN_API_SYSTEM_KEY, 'x-platform': siteType },
      body: fd,
    });
  } catch (err) {
    logger.error(`Main API request failed: ${err.message}`);
    return { ok: false, status: 0, data: null, mainIdByProductId: {}, error: `Could not reach main API: ${err.message}` };
  }

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    logger.warn(`Main API returned ${upstream.status}`);
    return {
      ok: false,
      status: upstream.status,
      data,
      mainIdByProductId: {},
      error: 'Main API rejected the sync.',
    };
  }

  // Map main-site product ids back to ours via the response's `index`.
  const mainIdByProductId = {};
  const created = data?.data?.products;
  if (Array.isArray(created)) {
    for (const p of created) {
      const ours = results[p.index]?.productId;
      if (ours != null && p.product_id != null) mainIdByProductId[ours] = p.product_id;
    }
  }

  return { ok: true, status: upstream.status, data, mainIdByProductId };
}

export default { postGroupedListings, hasSystemKey };
