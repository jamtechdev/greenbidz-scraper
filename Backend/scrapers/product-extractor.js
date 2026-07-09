/**
 * @file scrapers/product-extractor.js
 * @description Scrape a single product page using a JSON mapping profile, with
 *              retry + exponential backoff. Returns a normalised product object
 *              ready for persistence.
 */

import { goto, newPage, launchBrowser, closeBrowser } from '../config/puppeteer.js';
import { CONSTANTS } from '../config/constants.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import { simplifyQuantity } from '../services/normalize.js';

/**
 * Parse a price-like string into a number (or null).
 * @param {string} raw
 * @returns {number|null}
 */
export function parsePrice(raw) {
  if (!raw) return null;
  // Keep digits, dot, comma; then normalise.
  const cleaned = String(raw).replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  // If both separators present, assume comma = thousands.
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Treat lone comma as decimal if it looks like one (e.g. "12,50").
    normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '');
  }
  const num = Number.parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

/**
 * GENERAL tidy-up of a picked id token — mirrors cleanFieldText() on the
 * frontend so the Studio preview matches what's fetched. Drops a "Label:"
 * prefix, a leading symbol, and collapses whitespace.
 * @param {string} raw
 * @returns {string}
 */
export function cleanText(raw) {
  if (!raw) return raw == null ? '' : String(raw);
  let v = String(raw);
  const ci = v.indexOf(':');
  if (ci !== -1 && ci < v.length - 1) v = v.slice(ci + 1);
  v = v.replace(/^[^\p{L}\p{N}]+/u, '');
  v = v.replace(/\s+/g, ' ');
  return v.trim();
}

/**
 * Expand an image URL template for one product id — mirror of expandImagePattern
 * on the frontend. `{id}` → the product id, `{n}` → a zero-padded sequence.
 * @param {object} pattern - { urlTemplate, pad, start, count }
 * @param {string} id
 * @returns {string[]}
 */
export function expandImagePattern(pattern, id) {
  const tpl = (pattern.urlTemplate || '').trim();
  if (!tpl) return [];
  const idVal = (id == null ? '' : String(id)).trim();
  const hasN = /\{n\}/.test(tpl);
  const count = hasN ? Math.max(1, Math.floor(pattern.count || 1)) : 1;
  const start = Number.isFinite(pattern.start) ? pattern.start : 1;
  const pad = Math.max(0, Math.floor(pattern.pad || 0));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const n = String(start + i).padStart(pad, '0');
    out.push(tpl.replace(/\{id\}/g, idVal).replace(/\{n\}/g, n));
  }
  return out;
}

/**
 * HEAD/GET a URL to check it points at a real image (200 + image content-type).
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function probeImageUrl(url) {
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,*/*' };
  try {
    let res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' });
    // Some servers don't allow HEAD — fall back to GET.
    if (res.status === 403 || res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', headers, redirect: 'follow' });
    }
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Accept images; also accept a missing/octet-stream type (servers vary).
    return !ct || /^image\//.test(ct) || ct.includes('octet-stream');
  } catch {
    return false;
  }
}

/**
 * Build product image URLs from a template + per-product id, probing each in
 * sequence and STOPPING at the first 404 (so a product with 3 images doesn't
 * accumulate broken links). Returns the URLs that exist, in order.
 *
 * @param {object} pattern - profile.selectors.imagePattern
 * @param {string} id - the {id} token scraped from the page
 * @param {string} baseUrl - product URL, to resolve relative templates
 * @returns {Promise<string[]>}
 */
export async function resolvePatternImages(pattern, id, baseUrl) {
  const cleanId = pattern.idClean ? cleanText(id) : (id == null ? '' : String(id).trim());
  if (!cleanId) return [];
  const hasN = /\{n\}/.test(pattern.urlTemplate || '');
  const urls = expandImagePattern(pattern, cleanId).map((u) => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return u;
    }
  });
  const found = [];
  for (const u of urls) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await probeImageUrl(u);
    if (!ok) {
      if (hasN) break; // sequence: first gap ends the run
      continue; // no {n}: single URL — nothing more to try
    }
    found.push(u);
  }
  return found;
}

/**
 * The in-page extraction routine. Serialised into the browser context.
 * @param {object} fields - Profile fields definition.
 * @param {object} selectors - Profile-level selectors (images, etc.).
 * @returns {object} { values, imageUrls }
 */
/* istanbul ignore next — runs in browser context */
function extractInPage(fields, selectors) {
  // Field types that yield a dynamic { label: value } object instead of a scalar.
  const TABLE_TYPES = { table: 1, keyValueTable: 1 };

  /**
   * Build a { label: value } object from a key/value spec block. Captures EVERY
   * row present, so different products with different spec fields each return
   * whatever they list. Two shapes are supported:
   *   1. Explicit: `selector` matches the repeating ROWS, and keySelector /
   *      valueSelector locate the label & value within each row. Works for any
   *      markup (div grids, dl, custom layouts), not just <table>.
   *   2. Container: `selector` is the spec block; we auto-split its <tr> rows
   *      (td/th → key/value), falling back to <dt>/<dd> pairs.
   */
  const resolveTable = (def) => {
    const out = {};
    const txt = (el) => (el ? el.textContent.trim() : '');

    if (def.keySelector && def.valueSelector) {
      let rows = [];
      try {
        rows = Array.prototype.slice.call(document.querySelectorAll(def.selector));
      } catch {
        rows = [];
      }
      for (const row of rows) {
        const k = txt(row.querySelector(def.keySelector));
        if (k) out[k] = txt(row.querySelector(def.valueSelector));
      }
      return out;
    }

    let container = null;
    for (const sel of [def.selector, def.fallback].filter(Boolean)) {
      try {
        container = document.querySelector(sel);
      } catch {
        container = null;
      }
      if (container) break;
    }
    if (!container) return out;

    container.querySelectorAll('tr').forEach((row) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const k = txt(cells[0]);
        if (k) out[k] = txt(cells[1]);
      }
    });
    if (!Object.keys(out).length) {
      container.querySelectorAll('dt').forEach((dt) => {
        const k = txt(dt);
        if (k && dt.nextElementSibling) out[k] = txt(dt.nextElementSibling);
      });
    }
    // 3) Generic "Label: value" rows with NO <table>/<dl>. Many sites (e.g.
    //    Aucto) render each spec as  <h3><b>Manufacturer: </b>Clausing</h3>
    //    — the value is a bare text node, so it can't be picked individually.
    //    Find each element that holds EXACTLY ONE bold-ish label and take the
    //    rest of its text as the value. Only runs if the strategies above found
    //    nothing. Document order means the most granular row wins (a wrapper has
    //    >1 label and is skipped; the first real row sets the key).
    if (!Object.keys(out).length) {
      const labelSel = 'b, strong, dt, th, .font-bold, [class*="label" i]';
      container.querySelectorAll('h1,h2,h3,h4,h5,h6,li,p,div,tr,dd').forEach((row) => {
        const labels = row.querySelectorAll(labelSel);
        if (labels.length !== 1) return; // 0 = no label; >1 = a wrapper, not a row
        const labelText = txt(labels[0]);
        const key = labelText.replace(/[\s:：]+$/, '').trim();
        if (!key || out[key] !== undefined) return;
        const full = txt(row);
        const idx = full.indexOf(labelText);
        const rest = idx === -1 ? full : full.slice(idx + labelText.length);
        const value = rest.replace(/^[\s:：\-–—]+/, '').trim();
        if (value) out[key] = value;
      });
    }
    return out;
  };

  /**
   * Opt-in GENERAL "Clean" — tidy a field's value. Not currency-specific. Four
   * effects, applied in order (off by default; only runs when def.clean is true):
   *   1. If exactly one bold-ish label child prefixes the text, drop it
   *      (<span class="font-bold">Manufacturer: </span>Clausing → Clausing).
   *   2. "Label: Value" → split on the first colon.
   *   3. Strip a leading symbol / separator ($2,250.00 → 2,250.00, "- N/A" → N/A).
   *   4. Collapse internal whitespace (newlines/tabs/nbsp/doubled spaces) → one space.
   * Steps 2-4 mirror cleanFieldText() on the frontend so the live preview agrees.
   */
  const cleanLabelValue = (el, raw) => {
    const labelSel = 'b, strong, dt, th, .font-bold, [class*="label" i]';
    let label = '';
    try {
      const labels = el.querySelectorAll(labelSel);
      if (labels.length === 1) label = labels[0].textContent.trim();
    } catch {
      label = '';
    }
    let value = raw;
    if (label && value.indexOf(label) === 0) value = value.slice(label.length);
    const ci = value.indexOf(':');
    if (ci !== -1 && ci < value.length - 1) value = value.slice(ci + 1);
    value = value.replace(/^[^\p{L}\p{N}]+/u, ''); // leading $, €, -, spaces, …
    value = value.replace(/\s+/g, ' '); // collapse \n, \t, nbsp, doubled spaces
    return value.trim();
  };

  /** Resolve one field definition against the DOM. */
  const resolveField = (def) => {
    if (TABLE_TYPES[def.type]) return resolveTable(def);
    const trySelectors = [def.selector, def.fallback].filter(Boolean);
    for (const sel of trySelectors) {
      let el;
      try {
        el = document.querySelector(sel);
      } catch {
        el = null;
      }
      if (!el) continue;
      if (def.type === 'html') return el.innerHTML.trim();
      if (def.type === 'attr' && def.attr) return el.getAttribute(def.attr);
      // text / number / default
      const raw = el.textContent.trim();
      return def.clean ? cleanLabelValue(el, raw) : raw;
    }
    return null;
  };

  const values = {};
  for (const [name, def] of Object.entries(fields || {})) {
    values[name] = resolveField(def);
  }

  // Images. Lazy galleries keep the real URL in data-* attributes while `src`
  // holds a placeholder, so prefer data-* and skip obvious placeholders.
  const isPlaceholder = (v) =>
    !v || /^data:/.test(v) || /placeholder|blank|spacer|1x1|loading|transparent/i.test(v);
  const pickImg = (img) => {
    const cands = [
      img.getAttribute('data-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('data-lazy'),
      img.getAttribute('data-srcset'),
      img.currentSrc,
      img.getAttribute('src'),
    ];
    for (const c of cands) if (c && !isPlaceholder(c)) return c.split(/\s|,/)[0];
    for (const c of cands) if (c) return c.split(/\s|,/)[0];
    return null;
  };

  let imageUrls = [];
  const imgSel = selectors && selectors.images;
  if (imgSel) {
    try {
      imageUrls = Array.from(document.querySelectorAll(imgSel)).map(pickImg).filter(Boolean);
    } catch {
      imageUrls = [];
    }
  }
  // Dedupe (preserve order → first = main) & absolutise.
  imageUrls = Array.from(new Set(imageUrls)).map((u) => {
    try {
      return new URL(u, window.location.href).href;
    } catch {
      return u;
    }
  });

  // Image URL-pattern mode: grab the per-product {id} token from the page; the
  // URLs themselves are built & probed in Node (needs HTTP, done after evaluate).
  let patternId = null;
  const ip = selectors && selectors.imagePattern;
  if (ip && ip.idSelector) {
    try {
      const el = document.querySelector(ip.idSelector);
      if (el) patternId = el.textContent.trim();
    } catch {
      patternId = null;
    }
  }

  return { values, imageUrls, patternId, finalUrl: window.location.href, pageTitle: document.title };
}

/**
 * Validate that all required fields were extracted.
 * @param {object} fields - Profile field defs.
 * @param {object} values - Extracted values.
 * @returns {string[]} Names of missing required fields.
 */
function missingRequired(fields, values) {
  const missing = [];
  for (const [name, def] of Object.entries(fields || {})) {
    if (def.required && (values[name] == null || values[name] === '')) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Scrape a single product page once (no retry).
 *
 * @param {string} productUrl
 * @param {object} profile - The mapping profile.
 * @param {object} [options]
 * @param {import('puppeteer').Browser} [options.browser]
 * @returns {Promise<object>} Normalised product data.
 */
export async function scrapeProduct(productUrl, profile, options = {}) {
  const browser = options.browser || (await launchBrowser());
  const page = await newPage(browser);
  try {
    await goto(page, productUrl);

    const profileSelectors = profile.selectors || {};
    // Wait for the profile's anchor selector if provided (SPA hydration).
    if (profileSelectors.waitForSelector) {
      await page
        .waitForSelector(profileSelectors.waitForSelector, {
          timeout: profileSelectors.timeout || CONSTANTS.PAGE_TIMEOUT_MS,
        })
        .catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 2000)); // settle for SPA content

    // Scroll through the page to trigger lazy-loaded gallery images, then reset.
    await page
      .evaluate(async () => {
        const step = Math.max(400, window.innerHeight * 0.9);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 800));

    const { values, imageUrls: domImageUrls, patternId, finalUrl, pageTitle } =
      await page.evaluate(extractInPage, profile.fields || {}, profileSelectors);

    // Image URL-pattern mode: build & probe URLs from the template (stop on 404).
    // When configured it takes precedence over any DOM-scraped images.
    let imageUrls = domImageUrls;
    const imgPattern = profileSelectors.imagePattern;
    if (imgPattern && imgPattern.urlTemplate) {
      const patternUrls = await resolvePatternImages(
        imgPattern,
        patternId,
        finalUrl || productUrl,
      );
      if (patternUrls.length) {
        imageUrls = patternUrls;
        logger.step('🖼️', `Built ${patternUrls.length} image URL(s) from pattern for ${productUrl}`);
      } else {
        logger.warn(
          `Image pattern produced no reachable URLs for ${productUrl} (id="${patternId ?? ''}").`,
        );
      }
    }

    // Simplify a noisy "quantity" before persisting, so the stored raw_data is
    // clean (e.g. "<span>Available quantity:</span>1" → "1"). Only applied when
    // a number is actually found; otherwise the original value is kept.
    if (values.quantity != null) {
      const q = simplifyQuantity(values.quantity);
      if (q != null) values.quantity = q;
    }

    const missing = missingRequired(profile.fields, values);
    if (missing.length) {
      throw new Error(
        `Missing required field(s): ${missing.join(', ')} on ${productUrl}`,
      );
    }

    const externalId = productUrl.split('/').filter(Boolean).pop() || productUrl;

    return {
      externalId,
      productUrl: finalUrl || productUrl,
      title: values.title ?? pageTitle ?? null,
      price: parsePrice(values.price),
      priceRaw: values.price ?? null,
      description: values.description ?? null,
      rawData: { ...values, pageTitle },
      imagesRemoteUrls: imageUrls,
    };
  } finally {
    await page.close().catch(() => {});
    if (!options.browser) await closeBrowser(browser);
  }
}

/**
 * Scrape a product with retry + exponential backoff.
 *
 * @param {string} productUrl
 * @param {object} profile
 * @param {object} [options]
 * @param {import('puppeteer').Browser} [options.browser]
 * @returns {Promise<object>} Normalised product data.
 */
export async function scrapeProductWithRetry(productUrl, profile, options = {}) {
  return withRetry(() => scrapeProduct(productUrl, profile, options), {
    retries: CONSTANTS.MAX_RETRIES,
    delayMs: CONSTANTS.RETRY_DELAY_MS,
    label: `Scrape ${productUrl}`,
  });
}

export default { scrapeProduct, scrapeProductWithRetry, parsePrice };
