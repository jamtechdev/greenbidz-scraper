/**
 * @file controllers/sync.controller.js
 * @description Sync scraped products to the main GreenBidz site.
 *   GET  /api/sync/meta     → marketplaces (+site_type), sellers, defaults, enums, required
 *   POST /api/sync/preview  → per-product mapping + category match + missing required fields
 *   POST /api/sync/submit   → build multipart + POST to create-grouped-listings (live)
 */
import { logger } from '../utils/logger.js';
import { getProductById, markProductsSynced } from '../database/queries.js';
import { mapProduct } from '../services/syncMapper.js';
import {
  MARKETPLACES,
  SELLERS,
  SYNC_DEFAULTS,
  ENUMS,
  REQUIRED_FIELDS,
  getMarketplace,
  siteTypeFor,
} from '../config/sync-config.js';

const MAIN_API_BASE_URL = process.env.MAIN_API_BASE_URL || 'https://api.101recycle.greenbidz.com';
const MAIN_API_SYSTEM_KEY = process.env.MAIN_API_SYSTEM_KEY || '';

/** GET /api/sync/meta — everything the UI needs to render the sync flow. */
export function getSyncMeta(req, res) {
  res.json({
    marketplaces: MARKETPLACES.map((m) => ({
      name: m.name,
      displayName: m.displayName,
      siteType: siteTypeFor(m.name),
      categories: m.categories,
    })),
    sellers: SELLERS,
    defaults: SYNC_DEFAULTS,
    enums: ENUMS,
    requiredFields: REQUIRED_FIELDS,
  });
}

/** Load + map the selected products for a batch. Shared by preview & submit. */
async function buildBatch(body) {
  const { productIds, marketplace, sellerId, country, overrides = {} } = body || {};
  if (!Array.isArray(productIds) || !productIds.length) {
    return { error: 'productIds (non-empty array) required.' };
  }
  if (!marketplace) return { error: 'marketplace (site_type) required.' };
  if (!getMarketplace(marketplace)) return { error: `Unknown marketplace: ${marketplace}` };

  const seller = SELLERS.find((s) => String(s.id) === String(sellerId));
  if (!seller) return { error: 'Valid sellerId required.' };

  const results = [];
  for (const id of productIds) {
    const product = await getProductById(Number(id));
    if (!product) {
      results.push({ productId: Number(id), error: 'Product not found.' });
      continue;
    }
    results.push(
      mapProduct({
        product,
        marketplaceKey: marketplace,
        seller,
        country: country || '',
        overrides: overrides[id] || overrides[String(id)] || {},
      }),
    );
  }
  return { seller, country: country || '', marketplace, results };
}

/** POST /api/sync/preview */
export async function previewSync(req, res) {
  const batch = await buildBatch(req.body);
  if (batch.error) return res.status(400).json({ error: batch.error });

  const syncable = batch.results.filter((r) => r.syncable).length;
  res.json({
    marketplace: batch.marketplace,
    siteType: siteTypeFor(batch.marketplace),
    seller: batch.seller,
    country: batch.country,
    total: batch.results.length,
    syncable,
    blocked: batch.results.length - syncable,
    results: batch.results,
  });
}

/** POST /api/sync/submit — actually create the products on the main site. */
export async function submitSync(req, res) {
  if (!MAIN_API_SYSTEM_KEY) {
    return res.status(500).json({ error: 'MAIN_API_SYSTEM_KEY is not configured in the backend .env.' });
  }
  const batch = await buildBatch(req.body);
  if (batch.error) return res.status(400).json({ error: batch.error });

  const blocked = batch.results.filter((r) => !r.syncable);
  if (blocked.length) {
    return res.status(400).json({
      error: 'Some products are missing required fields.',
      blocked: blocked.map((r) => ({ productId: r.productId, missing: r.missing })),
    });
  }

  const siteType = siteTypeFor(batch.marketplace);
  const productsJson = batch.results.map((r) => r.mapped);
  const imageUrlsJson = batch.results.map((r) => r.images);

  const fd = new FormData();
  fd.append('products_json', JSON.stringify(productsJson));
  fd.append('auction_group_json', JSON.stringify({ country: batch.country }));
  fd.append('seller_id', String(batch.seller.id));
  fd.append('country', batch.country);
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
    return res.status(502).json({ error: `Could not reach main API: ${err.message}` });
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
    return res.status(502).json({ error: 'Main API rejected the sync.', status: upstream.status, data });
  }
  // Mark these products as synced so the UI flags them and blocks re-sync.
  // Map main-site product ids back to ours by the response's `index`.
  const syncedIds = batch.results.map((r) => r.productId);
  const mainIdByProductId = {};
  const created = data?.data?.products;
  if (Array.isArray(created)) {
    for (const p of created) {
      const ours = batch.results[p.index]?.productId;
      if (ours != null && p.product_id != null) mainIdByProductId[ours] = p.product_id;
    }
  }
  await markProductsSynced(syncedIds, mainIdByProductId).catch((err) =>
    logger.warn(`Could not mark products synced: ${err.message}`),
  );

  logger.success(`Sync OK (${productsJson.length} product(s)).`);
  res.json({ ok: true, siteType, count: productsJson.length, syncedIds, mainApiResponse: data });
}
