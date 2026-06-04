/**
 * @file detectors/field-auto-detector.js
 * @description Heuristic auto-detection of product field selectors on a
 *              rendered page. Runs inside Puppeteer (page.evaluate) to guess
 *              selectors for title, price, description, images, and SKU.
 *
 *              These guesses are NOT authoritative — they seed a pending
 *              mapping entry for a human to review/approve.
 */

import { newPage, closeBrowser, launchBrowser } from '../config/puppeteer.js';
import { CONSTANTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * The DOM-side detection routine. Serialised into the page context, so it may
 * only use browser globals (document, window) — no Node imports.
 * @returns {object} Detected field guesses.
 */
/* istanbul ignore next — runs in browser context */
function detectInPage() {
  /** Build a reasonably stable CSS selector for an element. */
  const cssPath = (el) => {
    if (!el) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let part = node.tagName.toLowerCase();
      const cls = (node.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter((c) => !/\d{3,}/.test(c)) // drop hashed/utility-ish classes
        .slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      parts.unshift(part);
      node = node.parentElement;
      depth += 1;
    }
    return parts.join(' > ');
  };

  const text = (el) => (el ? el.textContent.trim() : '');

  // ── Title: prefer h1, then og:title, then the largest heading ────────────
  const h1 = document.querySelector('h1');
  const titleSelector = h1 ? cssPath(h1) : 'h1';

  // ── Price: look for currency-bearing text or price-ish class names ───────
  let priceSelector = null;
  const priceCandidates = Array.from(
    document.querySelectorAll(
      '[class*="price" i], [data-price], [class*="amount" i], [itemprop="price"]',
    ),
  );
  const withCurrency = priceCandidates.find((el) =>
    /[$€£₹]\s?\d|\d[\d,.]*\s?(usd|eur|gbp|inr)/i.test(text(el)),
  );
  const priceEl = withCurrency || priceCandidates[0] || null;
  if (priceEl) priceSelector = cssPath(priceEl);

  // ── Description: long text blocks / description-ish containers ────────────
  let descriptionSelector = null;
  const descCandidates = Array.from(
    document.querySelectorAll(
      '[class*="description" i], [class*="detail" i], [itemprop="description"], article',
    ),
  );
  const longest = descCandidates
    .map((el) => ({ el, len: text(el).length }))
    .sort((a, b) => b.len - a.len)[0];
  if (longest && longest.len > 40) descriptionSelector = cssPath(longest.el);

  // ── SKU ───────────────────────────────────────────────────────────────────
  let skuSelector = null;
  const skuEl = document.querySelector(
    '[class*="sku" i], [itemprop="sku"], [data-sku]',
  );
  if (skuEl) skuSelector = cssPath(skuEl);

  // ── Images: product-ish images (largest, in main content) ─────────────────
  let imageSelector = null;
  const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
    const w = img.naturalWidth || img.width || 0;
    return w >= 200; // skip icons/logos
  });
  if (imgs.length) {
    const cls = (imgs[0].getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean)[0];
    imageSelector = cls ? `img.${cls}` : 'img';
  }

  return {
    title: titleSelector,
    price: priceSelector,
    description: descriptionSelector,
    sku: skuSelector,
    images: imageSelector,
    pageTitle: document.title || null,
  };
}

/**
 * Auto-detect candidate selectors for a product URL by rendering it.
 *
 * @param {string} url - A sample product URL.
 * @param {object} [options]
 * @param {import('puppeteer').Browser} [options.browser] - Reuse a browser.
 * @param {number} [options.settleMs=2500] - Extra wait for SPA hydration.
 * @returns {Promise<object>} Detected guesses + a ready-to-edit `fields` block.
 */
export async function autoDetectFields(url, options = {}) {
  const { browser: providedBrowser, settleMs = 3500 } = options;
  const browser = providedBrowser || (await launchBrowser());
  const page = await newPage(browser);
  try {
    logger.debug(`Auto-detecting fields on ${url}`);
    // domcontentloaded (not networkidle): SPAs often hold sockets open and never
    // go idle. Then wait for an h1 + settle so client-rendered content appears.
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: CONSTANTS.PAGE_TIMEOUT_MS,
    });
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, settleMs));

    const detected = await page.evaluate(detectInPage);

    // Shape into a profile-style `fields` block.
    const fields = {};
    if (detected.title)
      fields.title = { selector: detected.title, type: 'text', required: true };
    if (detected.price)
      fields.price = { selector: detected.price, type: 'text', required: false };
    if (detected.description)
      fields.description = {
        selector: detected.description,
        type: 'html',
        required: false,
      };
    if (detected.sku)
      fields.sku = { selector: detected.sku, type: 'text', required: false };

    return { detected, fields, imageSelector: detected.images };
  } finally {
    await page.close().catch(() => {});
    if (!providedBrowser) await closeBrowser(browser);
  }
}

export default { autoDetectFields };
