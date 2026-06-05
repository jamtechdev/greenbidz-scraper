/**
 * @file services/discovery.js
 * @description Listing → sample-product discovery and draft-profile building.
 */
import { launchBrowser, newPage, goto, closeBrowser } from '../config/puppeteer.js';
import { extractUrlPattern } from '../detectors/url-pattern-matcher.js';
import { extractDomain } from '../utils/validators.js';

/**
 * Render a listing page and try to discover candidate product-detail links.
 * @param {string} listingUrl
 * @returns {Promise<string[]>} candidate product URLs (most-likely first)
 */
export async function discoverSampleProductUrls(listingUrl) {
  const browser = await launchBrowser();
  const page = await newPage(browser);
  try {
    await goto(page, listingUrl);
    await new Promise((r) => setTimeout(r, 3000)); // SPA settle
    const links = await page.evaluate((listing) => {
      const origin = location.origin;
      const listingPath = new URL(listing, origin).pathname.replace(/\/$/, '');
      const groups = {};
      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        let href;
        try {
          href = new URL(a.getAttribute('href'), origin).href;
        } catch {
          continue;
        }
        const u = new URL(href);
        if (u.origin !== origin) continue; // same-site only
        const p = u.pathname.replace(/\/$/, '');
        if (p === listingPath || p === '') continue;
        const looksProduct = /\/\d+(?:$|\/)/.test(p) || /[a-z0-9-]{6,}$/i.test(p);
        if (!looksProduct) continue;
        const key = p.replace(/\d+/g, '#');
        (groups[key] = groups[key] || []).push(href);
      }
      const best = Object.values(groups).sort((a, b) => b.length - a.length)[0] || [];
      return Array.from(new Set(best)).slice(0, 5);
    }, listingUrl);
    return links;
  } finally {
    await page.close().catch(() => {});
    await closeBrowser(browser);
  }
}

/** Build an editable DOM-mode draft profile from auto-detected fields. */
export function buildDraftProfile(sampleProductUrl, detection) {
  const domain = extractDomain(sampleProductUrl) || 'example.com';
  const slug = domain.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const now = new Date().toISOString();
  return {
    profileId: `profile_${slug}`,
    profileName: `${domain} Product Scraper`,
    urlPattern: extractUrlPattern(sampleProductUrl),
    domain,
    source: 'dom',
    createdAt: now,
    updatedAt: now,
    downloadImages: true,
    sampleUrl: sampleProductUrl,
    fields: Object.keys(detection.fields || {}).length
      ? detection.fields
      : { title: { selector: 'h1', type: 'text', required: true } },
    selectors: {
      images: detection.imageSelector || 'img',
      waitForSelector: 'h1',
      timeout: 15000,
    },
    usageCount: 0,
    _suggestedFileName: `profile_${slug}.json`,
  };
}
