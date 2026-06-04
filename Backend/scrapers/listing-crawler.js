/**
 * @file scrapers/listing-crawler.js
 * @description Crawl a listing page, following traditional "Next" pagination,
 *              and collect every product URL across all pages.
 *
 *              Pagination is configurable per listing via a small config object
 *              (selectors for product links and the Next control). Sensible
 *              defaults are provided for the 101lab/GreenBidz marketplace.
 */

import { goto, newPage, launchBrowser, closeBrowser } from '../config/puppeteer.js';
import { CONSTANTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * @typedef {object} PaginationConfig
 * @property {string} productLinkSelector - Selector for anchors linking to products.
 * @property {string} [productUrlPattern] - Optional regex; only hrefs matching are kept.
 * @property {string} [nextSelector] - Selector for the "Next" button/link.
 * @property {string} [waitForSelector] - Selector to await after each navigation.
 * @property {number} [settleMs] - Extra wait after load for SPA hydration.
 * @property {number} [maxPages] - Hard cap on pages to visit.
 */

/** Default pagination config tuned for the GreenBidz/101lab marketplace SPA. */
export const DEFAULT_PAGINATION = {
  // Product cards link to /buyer-marketplace/<id>. We match those anchors.
  productLinkSelector: 'a[href*="/buyer-marketplace/"]',
  productUrlPattern: '/buyer-marketplace/\\d+',
  // Common "next page" controls; the crawler tries each in order.
  nextSelector:
    'a[rel="next"], button[aria-label*="next" i], a[aria-label*="next" i], .pagination .next:not(.disabled) a, li.next:not(.disabled) a',
  waitForSelector: 'a[href*="/buyer-marketplace/"]',
  settleMs: 2500,
  maxPages: CONSTANTS.MAX_PAGES,
};

/**
 * Scroll the page top-to-bottom in steps to trigger lazy-loaded product cards
 * and images, then return to the top. Best-effort; swallows errors.
 * @param {import('puppeteer').Page} page
 */
async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      const step = Math.max(400, window.innerHeight * 0.9);
      let last = -1;
      // Scroll until the page stops growing (infinite scroll) or we hit the end.
      for (let i = 0; i < 40; i++) {
        window.scrollBy(0, step);
        await new Promise((r) => setTimeout(r, 250));
        const h = document.body.scrollHeight;
        if (window.scrollY + window.innerHeight >= h) {
          if (h === last) break; // no more content loaded
          last = h;
        }
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    /* best-effort */
  }
}

/**
 * Collect product URLs visible on the current page.
 * @param {import('puppeteer').Page} page
 * @param {string} linkSelector
 * @param {string|null} urlPattern
 * @returns {Promise<string[]>} Absolute URLs.
 */
async function collectProductUrls(page, linkSelector, urlPattern) {
  const hrefs = await page.$$eval(linkSelector, (anchors) =>
    anchors.map((a) => a.href).filter(Boolean),
  );
  let urls = hrefs;
  if (urlPattern) {
    const re = new RegExp(urlPattern);
    urls = hrefs.filter((h) => re.test(h));
  }
  return urls;
}

/**
 * Attempt to click the "Next" control. Returns true if navigation to a new
 * page happened, false if there is no next page.
 * @param {import('puppeteer').Page} page
 * @param {string} nextSelector
 * @param {string} [waitForSelector]
 * @returns {Promise<boolean>}
 */
async function goToNextPage(page, nextSelector, waitForSelector) {
  const next = await page.$(nextSelector);
  if (!next) return false;

  // Determine whether the control is actually clickable/enabled.
  const clickable = await page.evaluate((el) => {
    const disabled =
      el.getAttribute('aria-disabled') === 'true' ||
      el.classList.contains('disabled') ||
      el.hasAttribute('disabled');
    return !disabled;
  }, next);
  if (!clickable) return false;

  const beforeUrl = page.url();

  try {
    // Some sites navigate (SSR), others swap content (SPA). Handle both:
    await Promise.all([
      page
        .waitForNavigation({
          waitUntil: CONSTANTS.NAV_WAIT_UNTIL,
          timeout: CONSTANTS.PAGE_TIMEOUT_MS,
        })
        .catch(() => null), // SPA: navigation may not fire
      next.click(),
    ]);
  } catch {
    return false;
  }

  if (waitForSelector) {
    await page
      .waitForSelector(waitForSelector, { timeout: CONSTANTS.PAGE_TIMEOUT_MS })
      .catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 800)); // let content swap

  // If neither URL nor content changed, treat as end of pagination.
  return page.url() !== beforeUrl || true;
}

/**
 * Crawl a listing page across all paginated pages and return all product URLs.
 *
 * @param {string} listingUrl
 * @param {object} [options]
 * @param {PaginationConfig} [options.pagination] - Pagination config.
 * @param {import('puppeteer').Browser} [options.browser] - Reuse a browser.
 * @returns {Promise<{ urls: string[], pagesVisited: number }>}
 */
export async function crawlListingPage(listingUrl, options = {}) {
  const pagination = { ...DEFAULT_PAGINATION, ...(options.pagination || {}) };
  const browser = options.browser || (await launchBrowser());
  const page = await newPage(browser);

  /** @type {Set<string>} */
  const productUrls = new Set();
  /** @type {Set<string>} */
  const visitedPageUrls = new Set();
  let pagesVisited = 0;

  try {
    logger.info(`🔍 Crawling: ${listingUrl}`);
    await goto(page, listingUrl);

    if (pagination.waitForSelector) {
      await page
        .waitForSelector(pagination.waitForSelector, {
          timeout: CONSTANTS.PAGE_TIMEOUT_MS,
        })
        .catch(() => {});
    }
    // SPA hydration settle.
    await new Promise((r) => setTimeout(r, pagination.settleMs));

    while (pagesVisited < pagination.maxPages) {
      pagesVisited += 1;
      visitedPageUrls.add(page.url());

      // Trigger lazy-loaded cards before harvesting links.
      await autoScroll(page);

      const found = await collectProductUrls(
        page,
        pagination.productLinkSelector,
        pagination.productUrlPattern,
      );
      found.forEach((u) => productUrls.add(u));

      logger.info(
        `📄 Found ${found.length} products on page ${pagesVisited} ` +
          `(total unique: ${productUrls.size})`,
      );

      // Advance to next page.
      const advanced = await goToNextPage(
        page,
        pagination.nextSelector,
        pagination.waitForSelector,
      );
      if (!advanced) break;

      // Loop-protection: if we've already visited this URL, stop.
      if (visitedPageUrls.has(page.url()) && pagesVisited > 1) {
        // Allow one repeat (SPA same-URL); break if product count didn't grow.
        const sizeBefore = productUrls.size;
        const more = await collectProductUrls(
          page,
          pagination.productLinkSelector,
          pagination.productUrlPattern,
        );
        more.forEach((u) => productUrls.add(u));
        if (productUrls.size === sizeBefore) break;
      }
    }

    logger.success(
      `Completed pagination. Total products found: ${productUrls.size} ` +
        `across ${pagesVisited} page(s).`,
    );
  } catch (err) {
    logger.error(`Listing crawl failed for ${listingUrl}: ${err.message}`, {
      url: listingUrl,
      stack: err.stack,
    });
    throw err;
  } finally {
    await page.close().catch(() => {});
    if (!options.browser) await closeBrowser(browser);
  }

  return { urls: Array.from(productUrls), pagesVisited };
}

export default { crawlListingPage, DEFAULT_PAGINATION };
