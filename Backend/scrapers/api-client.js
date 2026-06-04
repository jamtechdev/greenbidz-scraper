/**
 * @file scrapers/api-client.js
 * @description API-source crawler/extractor.
 *
 * Many modern marketplaces (including 101lab.co / GreenBidz) are React SPAs that
 * render nothing useful into static HTML and navigate via JS rather than anchor
 * links — so DOM scraping finds no product links and no price. They are instead
 * driven by a JSON REST API. This module crawls such an API directly, which is
 * far more reliable than headless-browser scraping.
 *
 * A profile opts into this mode with `"source": "api"` and an `"api"` block.
 * See profiles/profile_101lab.json for a complete, working example.
 */

import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/**
 * Read a value from an object by dot-path (e.g. "pagination.hasNextPage").
 * @param {object} obj
 * @param {string} pathStr
 * @returns {*}
 */
export function getByPath(obj, pathStr) {
  if (!pathStr) return obj;
  return pathStr.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

/**
 * Build a URL with a query object merged in.
 * @param {string} base
 * @param {Record<string, string|number>} query
 * @returns {string}
 */
function buildUrl(base, query = {}) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Fetch a single JSON page from the listing API.
 * @param {object} listingCfg - profile.api.listing
 * @param {number} page
 * @returns {Promise<object>} Parsed JSON body.
 */
async function fetchListingPage(listingCfg, page) {
  const query = { ...(listingCfg.query || {}) };
  if (listingCfg.pageParam) query[listingCfg.pageParam] = page;
  const url = buildUrl(listingCfg.url, query);

  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: listingCfg.method || 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ProductMonitor/1.0',
          ...(listingCfg.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    },
    { retries: 3, delayMs: 1500, label: `API listing page ${page}` },
  );
}

/**
 * Map a raw API record into a normalised product object using the profile's
 * fieldMap.
 *
 * @param {object} record - One API record.
 * @param {object} profile
 * @returns {object} Normalised product data (same shape as the DOM extractor).
 */
export function recordToProduct(record, profile) {
  const api = profile.api || {};
  const map = api.fieldMap || {};
  const listing = api.listing || {};

  const val = (key) => (key ? getByPath(record, key) : undefined);

  const externalId = String(
    val(map.externalId) ?? val(listing.idField) ?? '',
  );

  // Build product URL from template.
  const productUrl = (listing.productUrlTemplate || '').replace(
    /\{id\}/g,
    externalId,
  );

  // Images may be an array or a single string; normalise to array.
  let images = val(map.images);
  if (typeof images === 'string') {
    try {
      images = JSON.parse(images);
    } catch {
      images = [images];
    }
  }
  if (!Array.isArray(images)) images = images ? [images] : [];

  const priceRaw = val(map.price);
  const price =
    priceRaw == null || priceRaw === ''
      ? null
      : Number.parseFloat(String(priceRaw).replace(/[^\d.]/g, '')) || null;

  return {
    externalId,
    productUrl,
    title: val(map.title) ?? null,
    price,
    priceRaw: priceRaw ?? null,
    description: val(map.description) ?? null,
    rawData: record, // keep the entire API record for raw_data
    imagesRemoteUrls: images.filter(Boolean),
  };
}

/**
 * Crawl the entire listing API, following pagination, and return one
 * normalised product per record.
 *
 * @param {object} profile - An API-source profile.
 * @param {object} [options]
 * @param {number} [options.maxPages=1000]
 * @returns {Promise<{ products: object[], totalItems: number|null }>}
 */
export async function crawlListingApi(profile, options = {}) {
  const listing = (profile.api && profile.api.listing) || {};
  if (!listing.url) {
    throw new Error(`Profile "${profile.profileId}" is API-source but has no api.listing.url`);
  }

  const maxPages = options.maxPages ?? 1000;
  const dataPath = listing.dataPath || 'data';
  const hasNextPath = listing.pagination?.hasNextPath;
  const totalPagesPath = listing.pagination?.totalPagesPath;
  const totalItemsPath = listing.pagination?.totalItemsPath;

  let page = listing.startPage ?? 1;
  let totalItems = null;
  let totalPages = null;
  const products = [];
  const seenIds = new Set();

  logger.info(`🔍 Crawling API: ${listing.url}`);

  // eslint-disable-next-line no-constant-condition
  for (let i = 0; i < maxPages; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const body = await fetchListingPage(listing, page);

    if (totalItemsPath && totalItems == null) {
      totalItems = getByPath(body, totalItemsPath) ?? null;
    }
    if (totalPagesPath && totalPages == null) {
      totalPages = getByPath(body, totalPagesPath) ?? null;
    }

    const records = getByPath(body, dataPath);
    if (!Array.isArray(records) || records.length === 0) break;

    for (const record of records) {
      const product = recordToProduct(record, profile);
      if (!product.externalId || seenIds.has(product.externalId)) continue;
      seenIds.add(product.externalId);
      products.push(product);
    }

    logger.info(
      `📄 API page ${page}: ${records.length} record(s) ` +
        `(total collected: ${products.length}` +
        `${totalItems != null ? ` / ${totalItems}` : ''})`,
    );

    // Decide whether to continue.
    let hasNext;
    if (hasNextPath) {
      hasNext = !!getByPath(body, hasNextPath);
    } else if (totalPages != null) {
      hasNext = page < totalPages;
    } else {
      hasNext = records.length > 0; // fall back: stop when a page is empty
    }
    if (!hasNext) break;
    page += 1;
  }

  logger.success(
    `Completed API pagination. Total products: ${products.length}` +
      `${totalItems != null ? ` (reported total: ${totalItems})` : ''}.`,
  );

  return { products, totalItems };
}

/**
 * Fetch a single product (by external id) from the listing API — used by the
 * manual-override flow for API-source profiles, since the site exposes no
 * working per-item detail endpoint.
 *
 * @param {string} externalId
 * @param {object} profile
 * @returns {Promise<object|null>} Normalised product data, or null if not found.
 */
export async function fetchApiProductByExternalId(externalId, profile) {
  const { products } = await crawlListingApi(profile);
  return (
    products.find((p) => String(p.externalId) === String(externalId)) || null
  );
}

export default { crawlListingApi, recordToProduct, fetchApiProductByExternalId, getByPath };
