/**
 * @file controllers/sync.controller.js
 * @description Sync scraped products to the main GreenBidz site.
 *   GET  /api/sync/meta     → marketplaces (+site_type), sellers, defaults, enums, required
 *   POST /api/sync/preview  → per-product mapping + category match + missing required fields
 *   POST /api/sync/submit   → build multipart + POST to create-grouped-listings (live)
 */
import { logger } from '../utils/logger.js';
import {
  getProductById,
  markProductsSynced,
  getDistinctSourceCategories,
  listCategoryMappings,
  saveCategoryMappings,
} from '../database/queries.js';
import { readAllProfiles } from '../utils/file-manager.js';
import { mapProduct } from '../services/syncMapper.js';
import { postGroupedListings } from '../services/syncSender.js';
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
const MAIN_PLATFORM = process.env.MAIN_PLATFORM || 'LabGreenbidz';

// Live category endpoints per site_type (public — no auth). Lang param differs.
const CATEGORY_ENDPOINTS = {
  LabGreenbidz: { path: '/api/v1/product/lab/category', langParam: 'language' },
  machines: { path: '/api/v1/product/machines/category', langParam: 'language' },
  '101it': { path: '/api/v1/product/it/category', langParam: 'language' },
  recycle: { path: '/api/v1/product/category', langParam: 'lang' },
};

/** Defensively normalize an unknown category API payload to our tree shape. */
function normalizeCategories(json) {
  const arr = Array.isArray(json)
    ? json
    : Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.categories) ? json.categories
        : Array.isArray(json?.data?.categories) ? json.data.categories
          : Array.isArray(json?.data?.data) ? json.data.data
            : null;
  if (!arr) return null;
  const id = (o) => o?.id ?? o?.term_id ?? o?.category_id ?? o?.cat_id;
  const name = (o) => o?.name ?? o?.title ?? o?.label ?? o?.category_name;
  const subs = (o) => o?.subcategories ?? o?.subCategories ?? o?.children ?? o?.sub ?? [];
  const cats = arr
    .map((c) => {
      const cid = id(c);
      const cname = name(c);
      if (cid == null || !cname) return null;
      const sub = (subs(c) || [])
        .map((s) => {
          const sid = id(s);
          const sname = name(s);
          return sid == null || !sname ? null : { id: sid, name: sname, slug: s.slug ?? null, parent: cid };
        })
        .filter(Boolean);
      return { id: cid, name: cname, slug: c.slug ?? null, subcategories: sub };
    })
    .filter(Boolean);
  return cats.length ? cats : null;
}

/**
 * GET /api/sync/categories?siteType=&language= — live categories for a site_type,
 * with a silent fallback to the static marketplaces.json on any failure.
 */
export async function getSyncCategories(req, res) {
  const mp = getMarketplace(req.query.siteType);
  if (!mp) return res.status(400).json({ error: `Unknown siteType: ${req.query.siteType}` });
  const siteType = siteTypeFor(mp.name);
  const language = String(req.query.language || 'en');
  const cfg = CATEGORY_ENDPOINTS[siteType];

  if (cfg) {
    try {
      const url = `${MAIN_API_BASE_URL}${cfg.path}?${cfg.langParam}=${encodeURIComponent(language)}`;
      const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
      if (upstream.ok) {
        const json = await upstream.json();
        const categories = normalizeCategories(json);
        if (categories) return res.json({ categories, source: 'api', siteType });
      }
      logger.warn(`Category API for ${siteType} returned an unusable shape — using config.`);
    } catch (err) {
      logger.warn(`Category API for ${siteType} failed (${err.message}) — using config.`);
    }
  }
  // Silent fallback to the bundled config.
  res.json({ categories: mp.categories, source: 'config', siteType });
}

/** Normalised category key for grouping: trimmed + lower-cased. */
const normCat = (s) => String(s ?? '').trim().toLowerCase();
const mapKey = (c, s) => `${c}||${s || ''}`;

/**
 * GET /api/sync/source-categories?siteType=&profile=&productIds=
 * Scraped categories (from products) merged with their saved mapping, GROUPED
 * by category so the modal shows ONE row per category — case/whitespace
 * differences and varying subcategories (e.g. "Accessories" and
 * "Accessories › Hoses") collapse into a single "Accessories" row. The save
 * fan-out (postCategoryMappings) writes the chosen mapping back to every
 * underlying raw variant, so the exact-match sync lookup is unaffected.
 */
export async function getSourceCategories(req, res) {
  const mp = getMarketplace(req.query.siteType);
  if (!mp) return res.status(400).json({ error: `Unknown siteType: ${req.query.siteType}` });
  const siteType = siteTypeFor(mp.name);
  const profile = req.query.profile || undefined;
  const productIds = req.query.productIds
    ? String(req.query.productIds).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
    : undefined;

  const sources = await getDistinctSourceCategories({ profile, productIds });
  const mappings = await listCategoryMappings(siteType);
  const byKey = new Map(mappings.map((m) => [mapKey(m.source_category, m.source_subcategory), m]));

  // Group distinct (category, subcategory) variants by normalised category.
  const groups = new Map(); // normKey → { label, variants: [{category, subcategory}] }
  for (const s of sources) {
    const nk = normCat(s.category);
    if (!nk) continue;
    let g = groups.get(nk);
    if (!g) {
      g = { label: s.category, variants: [] };
      groups.set(nk, g);
    }
    // Prefer a nicer display label (one starting with a capital letter).
    if (/^[a-z]/.test(g.label) && /^[A-Z]/.test(s.category)) g.label = s.category;
    g.variants.push({ category: s.category, subcategory: s.subcategory });
  }

  const items = Array.from(groups.values())
    .map((g) => {
      // Current mapping = the main term mapped to ANY of this group's variants
      // (most recently updated wins, so a fresh save consolidates the group).
      let chosen = null;
      for (const v of g.variants) {
        const m = byKey.get(mapKey(v.category, v.subcategory));
        if (m && (!chosen || new Date(m.updated_at) > new Date(chosen.updated_at))) chosen = m;
      }
      return {
        source_category: g.label,
        source_subcategory: '', // grouped → the row represents the whole category
        variant_count: g.variants.length,
        main_term_id: chosen ? chosen.main_term_id : null,
        main_term_name: chosen ? chosen.main_term_name : null,
      };
    })
    .sort((a, b) => a.source_category.localeCompare(b.source_category));

  res.json({ siteType, items });
}

/**
 * POST /api/sync/category-mappings { siteType, mappings: [...] }
 * Each incoming mapping is category-level (subcategory ignored). Fan it out to
 * EVERY raw (category, subcategory) variant present in products — across all
 * casings — so the exact-match sync lookup resolves for every product, without
 * any change to the sync flow.
 */
export async function postCategoryMappings(req, res) {
  const { siteType, mappings } = req.body || {};
  const mp = getMarketplace(siteType);
  if (!mp) return res.status(400).json({ error: 'Valid siteType required.' });
  const st = siteTypeFor(mp.name);

  // All raw variants across all products, case-sensitive so every casing is kept.
  const allVariants = await getDistinctSourceCategories({ caseSensitive: true });
  const byNorm = new Map(); // normKey → [{category, subcategory}, …]
  for (const v of allVariants) {
    const nk = normCat(v.category);
    if (!byNorm.has(nk)) byNorm.set(nk, []);
    byNorm.get(nk).push(v);
  }

  const groups = Array.isArray(mappings) ? mappings : [];
  const expanded = [];
  for (const m of groups) {
    if (!m || !m.source_category || !m.main_term_id) continue;
    const variants = byNorm.get(normCat(m.source_category)) || [
      { category: m.source_category, subcategory: m.source_subcategory || '' },
    ];
    for (const v of variants) {
      expanded.push({
        source_category: v.category,
        source_subcategory: v.subcategory || '',
        main_term_id: m.main_term_id,
        main_term_name: m.main_term_name,
      });
    }
  }

  const written = await saveCategoryMappings(st, expanded);
  logger.success(
    `Saved ${written} category mapping(s) (fanned out from ${groups.length} group(s)) for ${st}.`,
  );
  res.json({ ok: true, written });
}

/** GET /api/sync/sellers?search=&page=&limit= — proxy the main site's seller list. */
export async function getSyncSellers(req, res) {
  if (!MAIN_API_SYSTEM_KEY) {
    return res.status(500).json({ error: 'MAIN_API_SYSTEM_KEY is not configured in the backend .env.' });
  }
  const params = new URLSearchParams();
  if (req.query.search) params.set('search', String(req.query.search));
  params.set('page', String(req.query.page || 1));
  params.set('limit', String(req.query.limit || 20));
  const url = `${MAIN_API_BASE_URL}/api/v1/admin/seller?${params.toString()}`;

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { 'x-system-key': MAIN_API_SYSTEM_KEY, 'x-platform': MAIN_PLATFORM },
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach main API: ${err.message}` });
  }
  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!upstream.ok || !data?.success) {
    return res.status(502).json({ error: 'Main API seller fetch failed.', status: upstream.status });
  }
  const list = data.data?.data ?? [];
  const sellers = list.map((s) => ({
    id: s.seller_id,
    displayName: s.company_name || s.email || `Seller #${s.seller_id}`,
    email: s.email,
    totalListings: s.total_listings,
    currency: s.currency,
  }));
  res.json({ sellers, pagination: data.data?.pagination ?? null });
}

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

/** Load + map the selected products for a batch. Shared by preview & submit
 *  (and by the background sync-job runner). */
export async function buildBatch(body) {
  const { productIds, marketplace, sellerId, sellerName, country, overrides = {} } = body || {};
  if (!Array.isArray(productIds) || !productIds.length) {
    return { error: 'productIds (non-empty array) required.' };
  }
  if (!marketplace) return { error: 'marketplace (site_type) required.' };
  if (!getMarketplace(marketplace)) return { error: `Unknown marketplace: ${marketplace}` };

  // Sellers come from the main site (loaded via /api/sync/sellers); the chosen
  // id + name are passed in.
  if (sellerId == null || Number.isNaN(Number(sellerId))) return { error: 'Valid sellerId required.' };
  const seller = { id: Number(sellerId), displayName: sellerName || `Seller #${sellerId}` };

  // Map each profile's fileName → its configured priceCurrency, so the sync
  // form pre-selects the currency the product was scraped with.
  const currencyByProfile = {};
  try {
    for (const e of await readAllProfiles()) {
      if (e.profile?.priceCurrency) currencyByProfile[e.fileName] = e.profile.priceCurrency;
    }
  } catch {
    /* profiles unavailable — fall back to default currency */
  }

  // Saved category mappings for this site_type → deterministic auto-select.
  const siteType = siteTypeFor(getMarketplace(marketplace).name);
  const categoryMappings = {};
  try {
    for (const m of await listCategoryMappings(siteType)) {
      categoryMappings[`${m.source_category}||${m.source_subcategory || ''}`] = {
        term_id: m.main_term_id,
        name: m.main_term_name,
      };
    }
  } catch {
    /* mappings unavailable — fall back to fuzzy match */
  }

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
        defaultCurrency: currencyByProfile[product.profile_file_name],
        categoryMappings,
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

  // Delegate the actual POST to the shared sender (identical mechanics).
  const sent = await postGroupedListings({
    siteType,
    results: batch.results,
    country: batch.country,
    seller: batch.seller,
  });
  if (!sent.ok) {
    if (sent.status === 0) return res.status(502).json({ error: sent.error });
    return res.status(502).json({ error: sent.error, status: sent.status, data: sent.data });
  }

  // Mark these products as synced so the UI flags them and blocks re-sync.
  const syncedIds = batch.results.map((r) => r.productId);
  await markProductsSynced(syncedIds, sent.mainIdByProductId).catch((err) =>
    logger.warn(`Could not mark products synced: ${err.message}`),
  );

  logger.success(`Sync OK (${batch.results.length} product(s)).`);
  res.json({ ok: true, siteType, count: batch.results.length, syncedIds, mainApiResponse: sent.data });
}
