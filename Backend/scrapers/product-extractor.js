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
 * The in-page extraction routine. Serialised into the browser context.
 * @param {object} fields - Profile fields definition.
 * @param {object} selectors - Profile-level selectors (images, etc.).
 * @returns {object} { values, imageUrls }
 */
/* istanbul ignore next — runs in browser context */
function extractInPage(fields, selectors) {
  /** Resolve one field definition against the DOM. */
  const resolveField = (def) => {
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
      return el.textContent.trim();
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

  return { values, imageUrls, finalUrl: window.location.href, pageTitle: document.title };
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

    const { values, imageUrls, finalUrl, pageTitle } = await page.evaluate(
      extractInPage,
      profile.fields || {},
      profileSelectors,
    );

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
