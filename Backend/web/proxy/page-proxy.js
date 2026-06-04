/**
 * @file web/proxy/page-proxy.js
 * @description Render an arbitrary external page with Puppeteer and return a
 *              SANITISED, same-origin HTML snapshot the Mapping Studio can load
 *              into an iframe and make interactive.
 *
 *              Why: browsers block framing arbitrary sites (X-Frame-Options /
 *              CSP) and same-origin policy stops us reading their DOM. By
 *              rendering server-side and serving the HTML from OUR origin, the
 *              injected selector script can run inside the iframe.
 *
 *              Sanitisation:
 *                - strip <script> (page must not navigate / re-render away),
 *                - strip CSP <meta> (would block our inline script),
 *                - inject <base href> so the site's own relative CSS/img/links
 *                  still resolve against the real origin,
 *                - inject our selector style + script.
 */

import { launchBrowser, newPage, closeBrowser } from '../../config/puppeteer.js';
import { CONSTANTS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { SELECTOR_SCRIPT, SELECTOR_STYLE } from './selector-inject.js';

// A single shared browser for the interactive builder (cheaper than launching
// one per request). Recreated lazily if it dies.
let sharedBrowser = null;

async function getBrowser() {
  const alive =
    sharedBrowser &&
    (typeof sharedBrowser.connected === 'boolean'
      ? sharedBrowser.connected
      : sharedBrowser.isConnected?.());
  if (!alive) {
    sharedBrowser = await launchBrowser();
  }
  return sharedBrowser;
}

/** Best-effort close of the shared browser (e.g. on shutdown). */
export async function closeProxyBrowser() {
  if (sharedBrowser) {
    await closeBrowser(sharedBrowser);
    sharedBrowser = null;
  }
}

/**
 * Remove <script> tags, CSP meta tags, and existing <base> tags from raw HTML.
 * @param {string} html
 * @returns {string}
 */
function stripUnsafe(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '');
}

/**
 * Inject our <base href>, selector style, and selector script into the HTML.
 * @param {string} html
 * @param {string} pageUrl - The real page URL (for <base href>).
 * @returns {string}
 */
function injectStudio(html, pageUrl) {
  const baseTag = `<base href="${pageUrl.replace(/"/g, '&quot;')}">`;
  const styleTag = `<style id="__sx_style">${SELECTOR_STYLE}</style>`;
  const scriptTag = `<script id="__sx_script">${SELECTOR_SCRIPT}</script>`;

  let out = html;

  // <base> must come first inside <head> so relative URLs resolve correctly.
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}\n${styleTag}`);
  } else {
    out = `${baseTag}${styleTag}${out}`;
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${scriptTag}\n</body>`);
  } else {
    out += scriptTag;
  }
  return out;
}

/**
 * Render + sanitise a page for the Mapping Studio iframe.
 *
 * @param {string} pageUrl
 * @returns {Promise<{ html: string, finalUrl: string, title: string }>}
 */
export async function renderProxyPage(pageUrl) {
  const browser = await getBrowser();
  const page = await newPage(browser);
  try {
    logger.info(`🪞 Proxy-rendering ${pageUrl}`);
    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: CONSTANTS.PAGE_TIMEOUT_MS,
    });
    // Give SPA content a chance to render (mirrors the scrapers' settle).
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    // Gently scroll through the page to trigger lazy-loaded cards/images, then
    // return to the top so the snapshot looks like the initial view.
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
    await new Promise((r) => setTimeout(r, 600));

    const raw = await page.evaluate(() => document.documentElement.outerHTML);
    const finalUrl = page.url();
    const title = await page.title().catch(() => '');

    const html = injectStudio(stripUnsafe(raw), finalUrl);
    return { html, finalUrl, title };
  } finally {
    await page.close().catch(() => {});
    // Keep the shared browser alive for the next render.
  }
}

export default { renderProxyPage, closeProxyBrowser };
