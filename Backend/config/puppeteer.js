/**
 * @file config/puppeteer.js
 * @description Centralised Puppeteer browser factory using puppeteer-extra +
 *              stealth plugin. Exposes helpers to launch a browser, open a
 *              hardened page, and tear everything down.
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { CONSTANTS, USER_AGENTS } from './constants.js';
import { logger } from '../utils/logger.js';

// Register the stealth plugin once at module load.
puppeteerExtra.use(StealthPlugin());

/**
 * Pick a random realistic desktop user-agent.
 * @returns {string}
 */
export function randomUserAgent() {
  const idx = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[idx];
}

/**
 * Launch a stealth Chromium instance.
 * @param {object} [overrides] - Optional puppeteer launch overrides.
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function launchBrowser(overrides = {}) {
  const browser = await puppeteerExtra.launch({
    headless: CONSTANTS.HEADLESS ? 'new' : false,
    defaultViewport: CONSTANTS.VIEWPORT,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${CONSTANTS.VIEWPORT.width},${CONSTANTS.VIEWPORT.height}`,
    ],
    ...overrides,
  });
  logger.debug('Puppeteer browser launched (stealth).');
  return browser;
}

/**
 * Open a new page with a random user-agent, viewport, and default timeouts
 * already applied.
 * @param {import('puppeteer').Browser} browser
 * @returns {Promise<import('puppeteer').Page>}
 */
export async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.setViewport(CONSTANTS.VIEWPORT);
  page.setDefaultTimeout(CONSTANTS.PAGE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(CONSTANTS.PAGE_TIMEOUT_MS);
  // Pretend to accept normal language headers.
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  return page;
}

/**
 * Navigate to a URL. Defaults to the configured wait strategy
 * (CONSTANTS.NAV_WAIT_UNTIL), but callers can override `waitUntil` — heavy
 * lazy-loading SPAs (e.g. labassets) never reach 'networkidle2', so the listing
 * crawler passes 'domcontentloaded' and gates on a content selector instead.
 * @param {import('puppeteer').Page} page
 * @param {string} url
 * @param {{ waitUntil?: string, timeout?: number }} [opts]
 * @returns {Promise<import('puppeteer').HTTPResponse | null>}
 */
export async function goto(page, url, opts = {}) {
  return page.goto(url, {
    waitUntil: opts.waitUntil || CONSTANTS.NAV_WAIT_UNTIL,
    timeout: opts.timeout || CONSTANTS.PAGE_TIMEOUT_MS,
  });
}

/**
 * Safely close a browser, swallowing teardown errors.
 * @param {import('puppeteer').Browser | null} browser
 */
export async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await browser.close();
  } catch (err) {
    logger.warn(`Error closing browser: ${err.message}`);
  }
}

export default { launchBrowser, newPage, goto, closeBrowser, randomUserAgent };
