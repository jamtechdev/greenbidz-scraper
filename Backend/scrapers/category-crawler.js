/**
 * @file scrapers/category-crawler.js
 * @description Discover CATEGORY URLs from a start page, for sites that organize
 *   products under many categories and don't publish a usable sitemap. You point
 *   the profile at one start page (shop/home); this finds the category links and
 *   the crawl pipeline then paginates each to collect products.
 *
 *   Two modes:
 *     - pattern-based (reliable): keep links matching the profile's
 *       discovery.categoryPatterns (same as the Sitemap step captured).
 *     - heuristic fallback: when no patterns, collect links inside nav/menu/
 *       category containers.
 *
 *   selectCategoryUrls() is pure (no network) and unit-tested offline.
 */
import { goto, newPage } from '../config/puppeteer.js';
import { logger } from '../utils/logger.js';

/**
 * Filter raw hrefs to category URLs: same-origin, matching at least one category
 * pattern, excluding product URLs, de-duplicated.
 *
 * @param {string[]} hrefs
 * @param {object} opts
 * @param {Array<string|RegExp>} [opts.categoryPatterns]
 * @param {string|null} [opts.origin] - Keep only URLs on this origin.
 * @param {string|RegExp|null} [opts.productPattern] - Drop URLs matching this.
 * @returns {string[]}
 */
export function selectCategoryUrls(hrefs, { categoryPatterns = [], origin = null, productPattern = null } = {}) {
  const pats = (categoryPatterns || [])
    .filter(Boolean)
    .map((p) => (p instanceof RegExp ? p : new RegExp(p)));
  if (!pats.length) return [];
  const prodRe = productPattern ? (productPattern instanceof RegExp ? productPattern : new RegExp(productPattern)) : null;

  const seen = new Set();
  const out = [];
  for (const h of hrefs || []) {
    if (!h || seen.has(h)) continue;
    if (origin) {
      try {
        if (new URL(h).origin !== origin) continue;
      } catch {
        continue;
      }
    }
    if (prodRe && prodRe.test(h)) continue; // a product URL, not a category
    if (!pats.some((re) => re.test(h))) continue; // must look like a category
    seen.add(h);
    out.push(h);
  }
  return out;
}

/**
 * Load a start page and return the category URLs found on it.
 *
 * @param {string} startUrl
 * @param {object} opts
 * @param {import('puppeteer').Browser} opts.browser
 * @param {Array<string|RegExp>} [opts.categoryPatterns]
 * @param {string|RegExp|null} [opts.productPattern]
 * @param {number} [opts.max=500] - Hard cap on category URLs returned.
 * @returns {Promise<string[]>}
 */
export async function discoverCategoryUrls(startUrl, { browser, categoryPatterns = [], productPattern = null, max = 500 } = {}) {
  const page = await newPage(browser);
  try {
    await goto(page, startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForSelector('a[href]', { timeout: 15000 }).catch(() => {});

    const hasPatterns = (categoryPatterns || []).filter(Boolean).length > 0;
    const origin = (() => {
      try {
        return new URL(startUrl).origin;
      } catch {
        return null;
      }
    })();

    if (hasPatterns) {
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href).filter(Boolean));
      const urls = selectCategoryUrls(hrefs, { categoryPatterns, origin, productPattern });
      logger.info(`📂 Category discovery (patterns): ${urls.length} category URL(s) on ${startUrl}.`);
      return urls.slice(0, max);
    }

    // Heuristic fallback: links inside nav/menu/category containers, same-origin.
    const hrefs = await page.$$eval(
      'nav a[href], [class*="menu" i] a[href], [class*="categor" i] a[href], [id*="menu" i] a[href]',
      (as) => as.map((a) => a.href).filter(Boolean),
    );
    const seen = new Set();
    const urls = [];
    const prodRe = productPattern ? (productPattern instanceof RegExp ? productPattern : new RegExp(productPattern)) : null;
    for (const h of hrefs) {
      if (!h || seen.has(h) || h === startUrl) continue;
      try {
        if (origin && new URL(h).origin !== origin) continue;
      } catch {
        continue;
      }
      if (prodRe && prodRe.test(h)) continue;
      seen.add(h);
      urls.push(h);
    }
    logger.info(`📂 Category discovery (heuristic nav): ${urls.length} candidate link(s) on ${startUrl}.`);
    return urls.slice(0, max);
  } finally {
    await page.close().catch(() => {});
  }
}

export default { selectCategoryUrls, discoverCategoryUrls };
