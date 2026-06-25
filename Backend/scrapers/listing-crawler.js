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
 * Drive lazy-loaded / infinite-scroll / "Load more" listings to render as many
 * product cards as possible, then return to the top. Best-effort.
 *
 * Strategy (more robust than scrolling on page height alone): repeatedly scroll
 * to the bottom AND click any "Load more"/"Show more" control, stopping only
 * when the count of matched product links stops growing for a couple of rounds.
 * Height can plateau while items keep loading (and vice-versa), so we gate on
 * the actual product-link count when a selector is provided.
 *
 * @param {import('puppeteer').Page} page
 * @param {object} [opts]
 * @param {string} [opts.linkSelector] - Product-link selector to count progress.
 * @param {string} [opts.loadMoreSelector] - Explicit "load more" control selector.
 * @param {number} [opts.maxRounds=60] - Hard cap on scroll/click iterations.
 */
async function autoScroll(page, opts = {}) {
  const { linkSelector = null, loadMoreSelector = null, maxRounds = 60 } = opts;
  try {
    await page.evaluate(
      async (linkSel, loadMoreSel, maxR) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const step = Math.max(400, window.innerHeight * 0.9);
        const countItems = () => (linkSel ? document.querySelectorAll(linkSel).length : -1);

        // Find a visible "load more / show more / view more" control.
        const findLoadMore = () => {
          if (loadMoreSel) {
            const el = document.querySelector(loadMoreSel);
            if (el && el.offsetParent !== null) return el;
          }
          const re = /\b(load|show|view)\s*more\b|more\s*(results|products|items)\b/i;
          const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
          return (
            candidates.find(
              (el) =>
                el.offsetParent !== null && // visible
                !el.hasAttribute('disabled') &&
                re.test((el.textContent || '').trim()),
            ) || null
          );
        };

        let lastCount = -1;
        let lastHeight = -1;
        let stagnant = 0;
        for (let i = 0; i < maxR; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(300);

          const btn = findLoadMore();
          if (btn) {
            btn.click();
            await sleep(700); // let the next page of items load
          } else {
            window.scrollBy(0, step);
            await sleep(250);
          }

          const count = countItems();
          const height = document.body.scrollHeight;
          const grew = count > lastCount || (count === -1 && height > lastHeight);
          if (grew) {
            stagnant = 0;
            lastCount = count;
            lastHeight = height;
          } else if (++stagnant >= 3) {
            break; // no new items for 3 rounds → done
          }
        }
        window.scrollTo(0, 0);
      },
      linkSelector,
      loadMoreSelector,
      maxRounds,
    );
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
 * Advance to the next listing page. Returns true if we moved to a NEW page.
 *
 * Strategy: prefer the standard `a[rel="next"]` link (falling back to the
 * profile's nextSelector). If the chosen control is an anchor with an href,
 * navigate to it DIRECTLY (deterministic for `?page=N` pagination — avoids
 * position-based selectors matching the wrong link on later pages). Only when
 * there's no usable href do we click (SPA content-swap). A target that is the
 * current/already-visited URL means we've reached the last page.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} nextSelector
 * @param {string} [waitForSelector]
 * @param {Set<string>} [visited]
 * @returns {Promise<boolean>}
 */
async function goToNextPage(page, nextSelector, waitForSelector, visited = new Set()) {
  const beforeUrl = page.url();

  // Slow listings render their pagination block late — wait for a pagination
  // control to appear before deciding there's no next page (fixes intermittent
  // "stops after page 1"). Resolves fast once the block is present; on the last
  // page it simply waits out the short timeout.
  await page.waitForSelector(`a[rel="next"], ${nextSelector}`, { timeout: 15000 }).catch(() => {});

  // Find the next control (rel="next" first, then the profile selector) and,
  // if it's a link, resolve its absolute href.
  const next = await page.evaluate((sel) => {
    const el = document.querySelector('a[rel="next"]') || document.querySelector(sel);
    if (!el) return null;
    const disabled =
      el.getAttribute('aria-disabled') === 'true' ||
      el.classList.contains('disabled') ||
      el.closest('.disabled, [aria-disabled="true"]') != null ||
      el.hasAttribute('disabled');
    if (disabled) return null;
    return { href: el.tagName === 'A' ? el.href : null };
  }, nextSelector);

  if (!next) return false;

  // ── URL-based pagination: navigate straight to the next page's URL ──
  if (next.href) {
    if (next.href === beforeUrl || visited.has(next.href)) return false; // last page
    // Fire navigation without blocking on the (slow) full lifecycle; wait for
    // the document URL to actually change, then for the product content.
    page
      .goto(next.href, { waitUntil: 'domcontentloaded', timeout: CONSTANTS.PAGE_TIMEOUT_MS })
      .catch(() => {});
    await page
      .waitForFunction((b) => location.href !== b, { timeout: 20000 }, beforeUrl)
      .catch(() => {});
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: CONSTANTS.PAGE_TIMEOUT_MS }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 600));
    return page.url() !== beforeUrl;
  }

  // ── SPA fallback: no href → click and wait for a content swap ──
  const handle = (await page.$('a[rel="next"]')) || (await page.$(nextSelector));
  if (!handle) return false;
  try {
    await Promise.all([
      page
        .waitForNavigation({
          waitUntil: 'domcontentloaded',
          timeout: Math.min(10000, CONSTANTS.PAGE_TIMEOUT_MS),
        })
        .catch(() => null),
      handle.click(),
    ]);
  } catch {
    return false;
  }
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: CONSTANTS.PAGE_TIMEOUT_MS }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 800));
  return page.url() !== beforeUrl;
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
    // Heavy lazy-loading listings (e.g. labassets) may never fire 'networkidle2'
    // OR even 'domcontentloaded' within the timeout — the HTML streams slowly.
    // So we do NOT block on the navigation lifecycle: fire it and gate on the
    // product-link selector actually appearing. A nav timeout is non-fatal as
    // long as content shows up.
    let navError = null;
    goto(page, listingUrl, { waitUntil: 'domcontentloaded' }).catch((e) => {
      navError = e.message;
    });

    const contentSelector = pagination.waitForSelector || pagination.productLinkSelector;
    const contentAppeared = contentSelector
      ? await page
          .waitForSelector(contentSelector, { timeout: CONSTANTS.PAGE_TIMEOUT_MS })
          .then(() => true)
          .catch(() => false)
      : true;

    if (!contentAppeared) {
      logger.warn(
        `No content matched "${contentSelector}" on ${listingUrl} ` +
          `${navError ? `(nav: ${navError})` : ''} — proceeding best-effort.`,
      );
    }
    // SPA hydration settle.
    await new Promise((r) => setTimeout(r, pagination.settleMs));

    // Early-stop: if a DB snapshot of already-known URLs is provided, stop
    // paginating after this many CONSECUTIVE pages with no previously-unseen
    // product (listings are newest-first, so an all-known run means we've hit the
    // already-scraped backlog). 0 / no seen set disables it.
    const seenUrls = options.seenUrls instanceof Set ? options.seenUrls : null;
    const earlyStopAfter = seenUrls ? CONSTANTS.CRAWL_EARLY_STOP_PAGES : 0;
    let consecutiveKnownPages = 0;

    while (pagesVisited < pagination.maxPages) {
      pagesVisited += 1;
      visitedPageUrls.add(page.url());

      // Trigger lazy-loaded / infinite-scroll / "load more" cards before harvesting.
      await autoScroll(page, {
        linkSelector: pagination.productLinkSelector,
        loadMoreSelector: pagination.loadMoreSelector,
      });

      const found = await collectProductUrls(
        page,
        pagination.productLinkSelector,
        pagination.productUrlPattern,
      );
      found.forEach((u) => productUrls.add(u));

      const newOnPage = seenUrls ? found.filter((u) => !seenUrls.has(u)).length : found.length;
      logger.info(
        `📄 Found ${found.length} products on page ${pagesVisited} ` +
          `(${newOnPage} new, total unique: ${productUrls.size})`,
      );

      // Early-stop check (only when a seen set was supplied).
      if (earlyStopAfter > 0) {
        if (newOnPage === 0) {
          consecutiveKnownPages += 1;
          if (consecutiveKnownPages >= earlyStopAfter) {
            logger.info(
              `⏭️  Early-stop: ${consecutiveKnownPages} consecutive page(s) with no new products ` +
                `— reached the known backlog after ${pagesVisited} page(s).`,
            );
            break;
          }
        } else {
          consecutiveKnownPages = 0;
        }
      }

      // Advance to next page.
      const advanced = await goToNextPage(
        page,
        pagination.nextSelector,
        pagination.waitForSelector,
        visitedPageUrls,
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
