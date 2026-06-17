/**
 * @file services/syncMapper.js
 * @description Map a scraped product (+ admin overrides + batch prereqs) into a
 * single `products_json` entry for the main site's create-grouped-listings API.
 * Also resolves the category (override id → auto-match by title) and reports
 * which required fields are still missing.
 */
import {
  getMarketplace,
  siteTypeFor,
  flattenCategories,
  matchCategory,
  SYNC_DEFAULTS,
} from '../config/sync-config.js';
import { htmlToText } from '../utils/html.js';
import {
  simplifyQuantity,
  normalizeCondition,
  parseWeight,
  findSpec,
  cleanText,
} from './normalize.js';

/** Coerce a value to a clean array (the main API expects arrays for these). */
function toArr(v) {
  if (v == null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== '');
}

/**
 * Resolve a category for a product: an explicit override id wins; otherwise
 * best-effort auto-match against the marketplace tree using title + description.
 */
export function resolveCategory({
  marketplace,
  categoryId,
  categoryName,
  scrapedCategory,
  scrapedSubcategory,
  categoryMappings = {},
  product,
  overrides = {},
}) {
  const flat = flattenCategories(marketplace);
  // 0) Explicit admin override always wins.
  if (categoryId) {
    const found = flat.find((c) => String(c.term_id) === String(categoryId));
    if (found) return { category: { ...found, name: categoryName || found.name }, autoMatched: false };
    // Selected from the live API (not in the bundled config) — trust the choice.
    return { category: { term_id: Number(categoryId), name: categoryName || '', isSub: false }, autoMatched: false };
  }
  // 1) Saved category mapping (deterministic) — keyed by scraped category(+sub).
  const key = `${scrapedCategory || ''}||${scrapedSubcategory || ''}`;
  const mm = categoryMappings[key];
  if (mm && mm.term_id) {
    return {
      category: { term_id: Number(mm.term_id), name: mm.name || '', isSub: false },
      autoMatched: true,
      fromMapping: true,
    };
  }
  // 2) Best-effort fuzzy fallback on scraped category + title.
  const text = [scrapedSubcategory, scrapedCategory, overrides.product_title || product.title, product.description]
    .filter(Boolean)
    .join(' ');
  const m = matchCategory(marketplace, text);
  return { category: m, autoMatched: !!m };
}

/**
 * @param {object} args
 * @param {object} args.product   - scraped product row (title, description, price, images_remote_urls, …)
 * @param {string} args.marketplaceKey - marketplace name or site_type value
 * @param {object} args.seller    - { id, displayName }
 * @param {string} args.country
 * @param {string} [args.defaultCurrency] - the product's profile priceCurrency (pre-selects price_currency)
 * @param {object} [args.overrides] - per-product admin edits (incl. categoryId)
 * @returns {{ productId:number, mapped:object, images:string[], category:object|null, categoryMatched:boolean, autoMatched:boolean, missing:string[], syncable:boolean }}
 */
export function mapProduct({
  product,
  marketplaceKey,
  seller,
  country,
  defaultCurrency,
  categoryMappings = {},
  overrides = {},
}) {
  const marketplace = getMarketplace(marketplaceKey);
  const site_type = siteTypeFor(marketplace ? marketplace.name : marketplaceKey);
  const rd = product.raw_data && typeof product.raw_data === 'object' ? product.raw_data : {};
  const scrapedCategory = rd.category ? String(rd.category) : null;
  const scrapedSubcategory = rd.subcategory ? String(rd.subcategory) : null;

  // Scraped specs live under raw_data.specifications (a { label: value } object
  // built by a `table`-type field) with site-varying keys. Parse defensively.
  let specs = {};
  if (rd.specifications && typeof rd.specifications === 'object') specs = rd.specifications;
  else if (typeof rd.specifications === 'string') {
    try {
      specs = JSON.parse(rd.specifications) || {};
    } catch {
      specs = {};
    }
  }

  // Intelligent fallbacks derived from scraped data — applied only when the
  // admin hasn't overridden the field (override > scraped > default).
  const scrapedQuantity = simplifyQuantity(rd.quantity);
  const scrapedCondition = normalizeCondition(
    findSpec(specs, [/item[\s_]*condition/i, /\bcondition\b/i]) || rd.condition,
  );
  const scrapedWeight = parseWeight(findSpec(specs, [/weight/i, /\bmass\b/i]));
  const scrapedDimensions = findSpec(specs, [/dimension/i, /\bsize\b/i]);
  const scrapedBrand = findSpec(specs, [/manufacturer/i, /\bbrand\b/i, /\bmake\b/i]);
  const scrapedModel = findSpec(specs, [/^model$/i, /\bmodel\b/i]);
  const scrapedSerial = findSpec(specs, [/serial/i]);

  // Condition: admin override wins; else normalized scrape; else default Used.
  const overrideCondition = toArr(overrides.item_condition);
  const conditionArr = overrideCondition.length
    ? overrideCondition
    : [scrapedCondition || 'usedFunctional'];
  const { category, autoMatched, fromMapping } = resolveCategory({
    marketplace,
    categoryId: overrides.categoryId,
    categoryName: overrides.categoryName,
    scrapedCategory,
    scrapedSubcategory,
    categoryMappings,
    product,
    overrides,
  });

  const rawPrice =
    overrides.price_per_unit != null && overrides.price_per_unit !== ''
      ? overrides.price_per_unit
      : product.price != null && product.price !== ''
        ? product.price
        : '';

  const images = Array.isArray(overrides.images)
    ? overrides.images
    : Array.isArray(product.images_remote_urls)
      ? product.images_remote_urls
      : [];

  const mapped = {
    product_title: overrides.product_title ?? product.title ?? '',
    // Descriptions are sometimes HTML — send clean readable text to the main site.
    product_content: htmlToText(overrides.product_content ?? product.description ?? ''),
    product_type: overrides.product_type ?? SYNC_DEFAULTS.product_type,
    product_category_ids: category ? String(category.term_id) : '',
    category_name: category ? category.name : '',
    seller_name: seller?.displayName ?? '',
    post_author_id: seller ? String(seller.id) : '',
    steps: SYNC_DEFAULTS.steps,
    quantity: String(overrides.quantity ?? scrapedQuantity ?? SYNC_DEFAULTS.quantity),
    sellerVisible: SYNC_DEFAULTS.sellerVisible,
    replacement_cost_per_unit: overrides.replacement_cost_per_unit ?? '',
    weight_per_unit: overrides.weight_per_unit ?? (scrapedWeight ?? ''),
    country: country ?? '',
    item_grade: overrides.item_grade ?? '',
    price_now_enabled: SYNC_DEFAULTS.price_now_enabled,
    price_format: overrides.price_format ?? SYNC_DEFAULTS.price_format,
    price_currency: overrides.price_currency ?? defaultCurrency ?? SYNC_DEFAULTS.price_currency,
    price_per_unit: rawPrice === '' ? '' : String(rawPrice),
    item_condition: conditionArr,
    operation_status: overrides.operation_status
      ? toArr(overrides.operation_status)
      : SYNC_DEFAULTS.operation_status,
    location: toArr(overrides.location ?? (country ? [country] : [])),
    allowed_sites: [site_type],
  };

  // Optional equipment specs: admin override wins, else fall back to scraped
  // specs (only included when a value exists).
  if (overrides.brand) mapped.brand = String(overrides.brand).trim();
  else if (scrapedBrand) mapped.brand = scrapedBrand;
  if (overrides.model) mapped.model = String(overrides.model).trim();
  else if (scrapedModel) mapped.model = scrapedModel;
  if (overrides.serial_number) mapped.serial_number = String(overrides.serial_number).trim();
  else if (scrapedSerial) mapped.serial_number = scrapedSerial;
  if (overrides.dimensions) mapped.dimensions = String(overrides.dimensions).trim();
  else if (scrapedDimensions) mapped.dimensions = scrapedDimensions;
  if (overrides.market_metrics) {
    mapped.market_metrics =
      typeof overrides.market_metrics === 'string'
        ? overrides.market_metrics
        : JSON.stringify(overrides.market_metrics);
  }

  // Required-field gating (see REQUIRED_FIELDS): category + price.
  const missing = [];
  if (!mapped.product_category_ids) missing.push('category');
  if (!mapped.price_per_unit) missing.push('price');

  return {
    productId: product.id,
    mapped,
    images,
    category: category ? { ...category, autoMatched } : null,
    categoryMatched: !!category,
    autoMatched,
    fromMapping: !!fromMapping,
    scrapedCategory,
    scrapedSubcategory,
    missing,
    syncable: missing.length === 0,
  };
}

export default { mapProduct, resolveCategory };
