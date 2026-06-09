/**
 * @file config/sync-config.js
 * @description Static configuration for syncing scraped products to the main
 * GreenBidz site (create-grouped-listings). v1: categories come from a static
 * file (marketplaces.json), seller is picked from a hard-coded list (login/admin
 * panel later), and unset fields get sensible defaults the admin can override.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Full marketplace → category/subcategory tree (real WP term IDs). */
export const MARKETPLACES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'marketplaces.json'), 'utf8'),
).marketplaces;

/**
 * marketplaces.json `name` → the site_type/allowed_sites value the main API
 * expects (see normalizeMarketplaceType in createProductV2). Also used as the
 * x-platform header.
 */
export const SITE_TYPE_BY_MARKETPLACE = {
  '101lab': 'LabGreenbidz',
  '101machine': 'machines',
  '101it': '101it',
  '101recycle': 'recycle',
};

/** Sellers the admin can pick from (login/admin-panel wiring comes later). */
export const SELLERS = [
  {
    id: 959,
    username: 'troupreixouveffei-8758',
    email: 'troupreixouveffei-8758@yopmail.com',
    displayName: 'First Last Name',
  },
];

/** Defaults for fields not present in scraped data (admin can override). */
export const SYNC_DEFAULTS = {
  product_type: 'simple',
  price_format: 'buyNow',
  price_currency: 'USD',
  quantity: '1',
  operation_status: ['deinstalled'],
  visibility: 'PUBLIC',
  sellerVisible: 'true',
  steps: '1',
  from_agent: true,
  price_now_enabled: '1',
  is_scraped: true,
};

/** Selectable option sets (extend as the main site adds values). */
export const ENUMS = {
  product_type: ['simple', 'auction'],
  price_format: ['buyNow', 'auction'],
  price_currency: ['USD', 'EUR', 'THB', 'GBP', 'JPY', 'CNY', 'INR'],
  // Only two selectable conditions on the sync UI. Values are the main API's
  // codes; the UI shows friendly labels (new → "New", usedFunctional → "Used").
  item_condition: ['new', 'usedFunctional'],
  item_grade: ['A', 'B', 'C', 'D'],
  operation_status: ['deinstalled', 'installed', 'running'],
  visibility: ['PUBLIC', 'PRIVATE'],
};

/** Fields that block a sync if empty (per product). */
export const REQUIRED_FIELDS = ['category', 'price'];

/** Resolve a marketplace by its name OR by its site_type value. */
export function getMarketplace(key) {
  if (!key) return null;
  return (
    MARKETPLACES.find((m) => m.name === key) ||
    MARKETPLACES.find((m) => SITE_TYPE_BY_MARKETPLACE[m.name] === key) ||
    null
  );
}

/** site_type/allowed_sites value for a marketplace name (or pass-through). */
export function siteTypeFor(key) {
  return SITE_TYPE_BY_MARKETPLACE[key] || key;
}

/** Flatten a marketplace's categories + subcategories into a lookup list. */
export function flattenCategories(marketplace) {
  const out = [];
  for (const c of marketplace?.categories || []) {
    out.push({ term_id: c.id, name: c.name, slug: c.slug, parent: null, isSub: false });
    for (const s of c.subcategories || []) {
      out.push({
        term_id: s.id,
        name: s.name,
        slug: s.slug,
        parent: c.id,
        parentName: c.name,
        isSub: true,
      });
    }
  }
  return out;
}

/**
 * Best-effort category match: score each category/subcategory by how many of
 * its significant name-words appear in the given text (product title/desc).
 * Prefers subcategories on ties. Returns null when nothing matches.
 * @param {object} marketplace
 * @param {string} text
 */
export function matchCategory(marketplace, text) {
  const flat = flattenCategories(marketplace);
  const hay = String(text || '').toLowerCase();
  if (!hay) return null;
  let best = null;
  let bestScore = 0;
  for (const cat of flat) {
    const words = cat.name
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 3);
    if (!words.length) continue;
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (score > bestScore || (score === bestScore && score > 0 && cat.isSub && best && !best.isSub)) {
      best = cat;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export default {
  MARKETPLACES,
  SITE_TYPE_BY_MARKETPLACE,
  SELLERS,
  SYNC_DEFAULTS,
  ENUMS,
  REQUIRED_FIELDS,
  getMarketplace,
  siteTypeFor,
  flattenCategories,
  matchCategory,
};
