/**
 * @file database/queries.js
 * @description All data-access operations for Product Monitor.
 *
 * Backed by Sequelize (see ../models). Straightforward reads use the models;
 * the subtle MySQL upserts (ON DUPLICATE KEY … with COALESCE / counter
 * increments) keep their exact SQL, executed over the same Sequelize
 * connection. Return shapes (snake_case keys, parsed JSON arrays, coerced
 * booleans) are preserved so nothing downstream changes.
 */

import { Op, QueryTypes, literal } from 'sequelize';
import { sequelize, Product, CrawlHistory, PendingMapping } from '../models/index.js';

/** Run raw SELECT SQL with positional `?` params, returning rows. */
function selectSql(text, replacements = []) {
  return sequelize.query(text, { replacements, type: QueryTypes.SELECT });
}

/** Run raw write SQL (INSERT/UPDATE) with positional `?` params. */
function writeSql(text, replacements = []) {
  return sequelize.query(text, { replacements });
}

/**
 * JSON arrays are stored in JSON columns. mysql2 returns JSON columns already
 * parsed into JS values, but we normalise defensively on read.
 * @param {*} value
 * @returns {Array<*>}
 */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ── products: discovery queue (the `scraped` flag lives here now) ────────────

/**
 * Check whether a product URL already exists in products.
 * @param {string} productUrl
 * @returns {Promise<boolean>}
 */
export async function hasSeenProduct(productUrl) {
  const n = await Product.count({ where: { product_url: productUrl } });
  return n > 0;
}

/**
 * Fetch the full set of known product URLs (for brand-new detection).
 * @returns {Promise<Set<string>>}
 */
export async function getSeenUrls() {
  const rows = await Product.findAll({ attributes: ['product_url'], raw: true });
  return new Set(rows.map((r) => r.product_url));
}

/**
 * Fetch the set of product URLs that have NOT yet been scraped.
 * @returns {Promise<Set<string>>}
 */
export async function getUnscrapedUrls() {
  const rows = await Product.findAll({
    where: { scraped: false },
    attributes: ['product_url'],
    raw: true,
  });
  return new Set(rows.map((r) => r.product_url));
}

/**
 * Record a discovered product as a stub row (scraped = FALSE) if it does not
 * already exist. Existing rows are left untouched except for last_seen_at.
 * @param {string} productUrl
 * @param {string} [externalId]
 * @returns {Promise<void>}
 */
export async function recordDiscoveredProduct(productUrl, externalId = null) {
  await writeSql(
    `INSERT INTO products (external_id, product_url, raw_data, scraped)
     VALUES (?, ?, ?, FALSE)
     ON DUPLICATE KEY UPDATE
       last_seen_at = CURRENT_TIMESTAMP,
       external_id  = COALESCE(VALUES(external_id), external_id)`,
    [
      externalId ?? (productUrl.split('/').filter(Boolean).pop() || productUrl),
      productUrl,
      JSON.stringify({}),
    ],
  );
}

/**
 * Explicitly flag a product as scraped.
 * @param {string} productUrl
 * @returns {Promise<void>}
 */
export async function markProductScraped(productUrl) {
  await Product.update(
    { scraped: true, scraped_at: literal('CURRENT_TIMESTAMP') },
    { where: { product_url: productUrl } },
  );
}

// ── products: full scrape persistence ────────────────────────────────────────

/**
 * Insert or update a product row (upsert on product_url).
 * @param {object} data
 * @returns {Promise<number|null>} The product id (existing or newly inserted).
 */
export async function upsertProduct(data) {
  const {
    externalId,
    productUrl,
    profileFileName,
    rawData,
    title = null,
    price = null,
    description = null,
    imagesLocalPaths = [],
    imagesRemoteUrls = [],
  } = data;

  await writeSql(
    `INSERT INTO products
       (external_id, product_url, profile_file_name, raw_data, title, price,
        description, images_local_paths, images_remote_urls,
        first_seen_at, last_seen_at, is_active, scraped, scraped_at, scrape_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE, TRUE, CURRENT_TIMESTAMP, 1)
     ON DUPLICATE KEY UPDATE
       external_id        = VALUES(external_id),
       profile_file_name  = VALUES(profile_file_name),
       raw_data           = VALUES(raw_data),
       title              = VALUES(title),
       price              = VALUES(price),
       description        = VALUES(description),
       images_local_paths = VALUES(images_local_paths),
       images_remote_urls = VALUES(images_remote_urls),
       last_seen_at       = CURRENT_TIMESTAMP,
       is_active          = TRUE,
       scraped            = TRUE,
       scraped_at         = CURRENT_TIMESTAMP,
       scrape_attempts    = scrape_attempts + 1,
       last_error         = NULL`,
    [
      externalId,
      productUrl,
      profileFileName,
      JSON.stringify(rawData ?? {}),
      title,
      price,
      description,
      JSON.stringify(imagesLocalPaths ?? []),
      JSON.stringify(imagesRemoteUrls ?? []),
    ],
  );

  const row = await Product.findOne({
    where: { product_url: productUrl },
    attributes: ['id'],
    raw: true,
  });
  return row ? row.id : null;
}

/**
 * Update the locally-downloaded image paths for an existing product.
 * @param {number} productId
 * @param {string[]} localPaths
 * @returns {Promise<void>}
 */
export async function updateProductImages(productId, localPaths) {
  await Product.update({ images_local_paths: localPaths ?? [] }, { where: { id: productId } });
}

/**
 * Record a scrape failure against a product URL (creates a stub row if needed).
 * @param {string} productUrl
 * @param {string} errorMessage
 * @param {string} [profileFileName]
 * @returns {Promise<void>}
 */
export async function recordProductError(productUrl, errorMessage, profileFileName = null) {
  await writeSql(
    `INSERT INTO products
       (external_id, product_url, profile_file_name, raw_data, is_active,
        scrape_attempts, last_error)
     VALUES (?, ?, ?, ?, FALSE, 1, ?)
     ON DUPLICATE KEY UPDATE
       scrape_attempts = scrape_attempts + 1,
       last_error      = VALUES(last_error),
       last_seen_at    = CURRENT_TIMESTAMP`,
    [
      productUrl.split('/').pop() || productUrl,
      productUrl,
      profileFileName,
      JSON.stringify({}),
      errorMessage,
    ],
  );
}

/**
 * Fetch a product row by URL.
 * @param {string} productUrl
 * @returns {Promise<object|null>}
 */
export async function getProductByUrl(productUrl) {
  const row = await Product.findOne({ where: { product_url: productUrl }, raw: true });
  if (!row) return null;
  row.images_local_paths = asArray(row.images_local_paths);
  row.images_remote_urls = asArray(row.images_remote_urls);
  return row;
}

/**
 * Override the profile used for a product (manual override feature).
 * @param {string} productUrl
 * @param {string} profileFileName
 * @returns {Promise<void>}
 */
export async function setProductProfile(productUrl, profileFileName) {
  await writeSql(
    `INSERT INTO products (external_id, product_url, profile_file_name, raw_data)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE profile_file_name = VALUES(profile_file_name)`,
    [productUrl.split('/').pop() || productUrl, productUrl, profileFileName, JSON.stringify({})],
  );
}

// ── crawl_history ─────────────────────────────────────────────────────────────

/**
 * Insert a crawl-history record.
 * @param {object} entry
 * @returns {Promise<number>} Inserted row id.
 */
export async function recordCrawl(entry) {
  const {
    listingUrl,
    productsFound = 0,
    newProducts = 0,
    failedProducts = 0,
    durationSeconds = 0,
    status = 'completed',
    errorMessage = null,
  } = entry;

  const row = await CrawlHistory.create({
    listing_url: listingUrl,
    products_found: productsFound,
    new_products: newProducts,
    failed_products: failedProducts,
    crawl_duration_seconds: durationSeconds,
    status,
    error_message: errorMessage,
  });
  return row.id;
}

// ── pending_mappings ──────────────────────────────────────────────────────────

/**
 * Insert a pending mapping for review when no profile matches a URL pattern.
 * Idempotent on url_pattern.
 * @param {object} entry
 * @returns {Promise<void>}
 */
export async function addPendingMapping({ urlPattern, sampleUrl, autoDetectedFields = null }) {
  await writeSql(
    `INSERT INTO pending_mappings (url_pattern, sample_url, auto_detected_fields, status)
     VALUES (?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE sample_url = VALUES(sample_url)`,
    [urlPattern, sampleUrl, autoDetectedFields ? JSON.stringify(autoDetectedFields) : null],
  );
}

/**
 * List pending mappings (optionally filtered by status).
 * @param {string} [status='pending']
 * @returns {Promise<object[]>}
 */
export async function listPendingMappings(status = 'pending') {
  return PendingMapping.findAll({
    where: { status },
    order: [['created_at', 'DESC']],
    raw: true,
  });
}

/**
 * Refresh the auto-detected fields stored against a pending mapping.
 * @param {number} id
 * @param {object} autoDetectedFields
 * @returns {Promise<void>}
 */
export async function updatePendingMappingFields(id, autoDetectedFields) {
  await PendingMapping.update(
    { auto_detected_fields: autoDetectedFields ?? {} },
    { where: { id } },
  );
}

// ── read helpers (for the web UI / reporting) ────────────────────────────────

/**
 * List recently-seen products, newest first, with image arrays parsed.
 * @param {object} [opts]
 * @returns {Promise<object[]>}
 */
export async function listRecentProducts({ limit = 50, scrapedOnly = false } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 50));
  const rows = await Product.findAll({
    attributes: [
      'id', 'external_id', 'product_url', 'profile_file_name', 'title', 'price',
      'scraped', 'scraped_at', 'first_seen_at', 'last_seen_at', 'is_active',
      'images_local_paths', 'images_remote_urls', 'last_error',
      'synced_at', 'main_product_id',
    ],
    where: scrapedOnly ? { scraped: true } : undefined,
    order: [['last_seen_at', 'DESC']],
    limit: lim,
    raw: true,
  });
  return rows.map((r) => ({
    ...r,
    scraped: !!r.scraped,
    is_active: !!r.is_active,
    synced: !!r.synced_at,
    images_local_paths: asArray(r.images_local_paths),
    images_remote_urls: asArray(r.images_remote_urls),
  }));
}

/**
 * Mark products as synced to the main site (sets synced_at = now). Optionally
 * stores the main-site product id when a 1:1 mapping is known.
 * @param {number[]} ids
 * @returns {Promise<number>} rows updated
 */
export async function markProductsSynced(ids, mainIdByProductId = {}) {
  const clean = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n));
  if (!clean.length) return 0;
  const [count] = await Product.update(
    { synced_at: literal('CURRENT_TIMESTAMP') },
    { where: { id: { [Op.in]: clean } } },
  );
  // Store the main-site product id where the response provided a mapping.
  for (const id of clean) {
    const mid = mainIdByProductId[id];
    if (mid != null) {
      // eslint-disable-next-line no-await-in-loop
      await Product.update({ main_product_id: Number(mid) }, { where: { id } });
    }
  }
  return count;
}

/**
 * Count products grouped by scraped flag.
 * @returns {Promise<{ total: number, scraped: number, unscraped: number }>}
 */
export async function countProducts() {
  const rows = await selectSql(
    `SELECT
       COUNT(*) AS total,
       SUM(scraped = TRUE) AS scraped,
       SUM(scraped = FALSE) AS unscraped
     FROM products`,
  );
  const r = rows[0] || {};
  return {
    total: Number(r.total) || 0,
    scraped: Number(r.scraped) || 0,
    unscraped: Number(r.unscraped) || 0,
  };
}

/**
 * Count products belonging to a site/domain (matched on the product URL host).
 * @param {string} domain
 * @returns {Promise<number>}
 */
export async function countProductsByDomain(domain) {
  if (!domain) return 0;
  return Product.count({ where: { product_url: { [Op.like]: `%://${domain}/%` } } });
}

/**
 * List recent crawl-history runs, newest first.
 * @param {object} [opts]
 * @returns {Promise<object[]>}
 */
export async function listCrawlHistory({ limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  return CrawlHistory.findAll({
    attributes: [
      'id', 'listing_url', 'products_found', 'new_products', 'failed_products',
      'crawl_duration_seconds', 'status', 'error_message', 'timestamp',
    ],
    order: [['timestamp', 'DESC']],
    limit: lim,
    raw: true,
  });
}

/**
 * Latest crawl timestamp per listing URL — used to show "last scraped" per
 * profile on the Profiles page.
 * @returns {Promise<Array<{ listing_url: string, last_timestamp: string }>>}
 */
export async function getLastCrawlTimes() {
  return selectSql(
    `SELECT listing_url, MAX(timestamp) AS last_timestamp
     FROM crawl_history
     GROUP BY listing_url`,
  );
}

/**
 * Fetch a single product row by its numeric id, with image arrays parsed and
 * raw_data decoded. Returns null when not found.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getProductById(id) {
  const row = await Product.findByPk(id, { raw: true });
  if (!row) return null;
  row.scraped = !!row.scraped;
  row.is_active = !!row.is_active;
  row.images_local_paths = asArray(row.images_local_paths);
  row.images_remote_urls = asArray(row.images_remote_urls);
  if (typeof row.raw_data === 'string') {
    try {
      row.raw_data = JSON.parse(row.raw_data);
    } catch {
      /* leave as-is */
    }
  }
  return row;
}

export default {
  hasSeenProduct,
  getSeenUrls,
  getUnscrapedUrls,
  recordDiscoveredProduct,
  markProductScraped,
  upsertProduct,
  updateProductImages,
  recordProductError,
  getProductByUrl,
  setProductProfile,
  recordCrawl,
  addPendingMapping,
  listPendingMappings,
  updatePendingMappingFields,
  listRecentProducts,
  markProductsSynced,
  countProducts,
  countProductsByDomain,
  listCrawlHistory,
  getProductById,
};
