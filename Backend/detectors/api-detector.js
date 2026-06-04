/**
 * @file detectors/api-detector.js
 * @description Auto-detect a site's JSON listing API by rendering the listing
 *              page and inspecting the XHR/fetch responses it makes. Produces a
 *              best-guess `api` profile block (listing endpoint + pagination +
 *              field-map) for the review UI to pre-fill.
 *
 *              This is heuristic: it finds the JSON response that most looks
 *              like a product list, then guesses paths and field mappings. The
 *              user reviews/edits the result before saving.
 */

import { launchBrowser, newPage, closeBrowser } from '../config/puppeteer.js';
import { CONSTANTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/** Third-party/analytics hosts whose JSON we ignore. */
const IGNORE_HOST = /gtm|google|googletagmanager|analytics|tawk\.to|facebook|hotjar|segment|sentry|doubleclick|clarity/i;

/**
 * Walk a JSON value and collect every array-of-objects with its dotted path.
 * @param {*} node
 * @param {string} prefix
 * @param {Array<{path:string,len:number,sample:object}>} out
 */
function collectArrays(node, prefix, out) {
  if (Array.isArray(node)) {
    if (node.length && typeof node[0] === 'object' && node[0] && !Array.isArray(node[0])) {
      out.push({ path: prefix, len: node.length, sample: node[0] });
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectArrays(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

/**
 * Find the dotted path to the first key matching a regex (depth-first).
 * @param {*} node
 * @param {RegExp} re
 * @param {string} prefix
 * @returns {string|null}
 */
function findPath(node, re, prefix = '') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  for (const [k, v] of Object.entries(node)) {
    const here = prefix ? `${prefix}.${k}` : k;
    if (re.test(k) && (typeof v === 'boolean' || typeof v === 'number')) return here;
  }
  for (const [k, v] of Object.entries(node)) {
    const got = findPath(v, re, prefix ? `${prefix}.${k}` : k);
    if (got) return got;
  }
  return null;
}

/**
 * Guess a field-map from a sample record.
 * @param {object} rec
 * @returns {Record<string,string>}
 */
function guessFieldMap(rec) {
  const keys = Object.keys(rec || {});
  const pick = (re, pref) => {
    // prefer an *_en variant when present
    const en = keys.find((k) => re.test(k) && /_en$/i.test(k));
    if (en) return en;
    return keys.find((k) => re.test(k)) || pref;
  };
  const map = {};
  const title = pick(/title|name|product.*name|heading/i);
  if (title) map.title = title;
  const desc = keys.find((k) => /desc/i.test(k) && /_en$/i.test(k)) || keys.find((k) => /desc/i.test(k));
  if (desc) map.description = desc;
  const price = keys.find((k) => /(target_)?price|amount|value|cost/i.test(k) && typeof rec[k] !== 'object');
  if (price) map.price = price;
  // images: a key whose value is an array, or name looks image-ish
  const img =
    keys.find((k) => Array.isArray(rec[k]) && /image|photo|img|thumb|picture|media/i.test(k)) ||
    keys.find((k) => /image|photo|img|thumb|picture/i.test(k)) ||
    keys.find((k) => Array.isArray(rec[k]) && typeof rec[k][0] === 'string');
  if (img) map.images = img;
  // externalId: prefer a key like batchNumber/productId/number/id
  const ext =
    keys.find((k) => /number$/i.test(k)) ||
    keys.find((k) => /^id$/i.test(k)) ||
    keys.find((k) => /(product|item|batch).*id/i.test(k)) ||
    keys.find((k) => /id$/i.test(k));
  if (ext) map.externalId = ext;
  return map;
}

/**
 * Build a product-URL template from a sample product URL WITHOUT url-encoding
 * the {id} placeholder (origin + pathname concatenation, not URL setter).
 * @param {string} sampleProductUrl
 * @returns {string}
 */
export function templateFromSample(sampleProductUrl) {
  try {
    const u = new URL(sampleProductUrl);
    const p = u.pathname.replace(/\d+(?=\/?$)/, '{id}');
    return u.origin + p + (u.search || '');
  } catch {
    return '';
  }
}

/**
 * Detect the listing API configuration for a site.
 *
 * @param {string} listingUrl
 * @param {object} [options]
 * @param {string} [options.sampleProductUrl] - used to build productUrlTemplate.
 * @param {number} [options.settleMs=4500]
 * @returns {Promise<{ found: boolean, api?: object, sampleRecord?: object, endpoint?: string, message?: string }>}
 */
export async function detectApiConfig(listingUrl, options = {}) {
  const { sampleProductUrl, settleMs = 4500 } = options;
  const browser = await launchBrowser();
  const page = await newPage(browser);
  /** @type {Array<{url:string, body:any}>} */
  const captured = [];

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;
      if (IGNORE_HOST.test(url)) return;
      const body = await res.json();
      captured.push({ url, body });
    } catch {
      /* ignore non-JSON / parse errors */
    }
  });

  try {
    // Use domcontentloaded (not networkidle): many SPAs hold a socket open
    // (live chat, analytics) and never go idle. We just need XHRs to fire, then
    // settle for a few seconds to capture the listing API call.
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: CONSTANTS.PAGE_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, settleMs));
  } catch (err) {
    logger.warn(`API detect navigation issue: ${err.message}`);
  } finally {
    await page.close().catch(() => {});
    await closeBrowser(browser);
  }

  // Score each captured JSON response by the size of its best data array and
  // whether the sample record looks product-like.
  let best = null;
  for (const cap of captured) {
    const arrays = [];
    collectArrays(cap.body, '', arrays);
    for (const a of arrays) {
      const keys = Object.keys(a.sample || {});
      const productish = keys.some((k) => /title|name|price|image|product|id|number/i.test(k));
      const score = a.len * (productish ? 10 : 1) + keys.length;
      if (!best || score > best.score) best = { ...a, score, url: cap.url, body: cap.body };
    }
  }

  if (!best) {
    return {
      found: false,
      message:
        'No product-like JSON API was observed on this page. The site may render ' +
        'server-side, or load data differently. Fill the API fields manually, or use DOM mode.',
    };
  }

  // Separate the page param from other query params on the request URL.
  let endpointUrl = best.url;
  const query = {};
  let pageParam = 'page';
  try {
    const u = new URL(best.url);
    for (const [k, v] of u.searchParams.entries()) {
      if (/^(page|pageno|page_number|pagenumber|offset|start|p)$/i.test(k)) {
        pageParam = k;
      } else {
        query[k] = /^\d+$/.test(v) ? Number(v) : v;
      }
    }
    endpointUrl = u.origin + u.pathname; // strip query (it's reconstructed from query+pageParam)
  } catch {
    /* keep best.url */
  }

  // Pagination paths within the response body.
  const pagination = {};
  const hasNext = findPath(best.body, /hasnext|has_next|hasmore|has_more/i);
  if (hasNext) pagination.hasNextPath = hasNext;
  const totalPages = findPath(best.body, /totalpages|total_pages|pagecount|page_count/i);
  if (totalPages) pagination.totalPagesPath = totalPages;
  const totalItems = findPath(best.body, /totalitems|total_items|totalcount|total_count|total$/i);
  if (totalItems) pagination.totalItemsPath = totalItems;

  const fieldMap = guessFieldMap(best.sample);
  const productUrlTemplate = sampleProductUrl ? templateFromSample(sampleProductUrl) : '';

  return {
    found: true,
    endpoint: endpointUrl,
    sampleRecord: best.sample,
    api: {
      listing: {
        url: endpointUrl,
        method: 'GET',
        headers: {},
        query,
        pageParam,
        startPage: 1,
        dataPath: best.path || 'data',
        idField: fieldMap.externalId || 'id',
        productUrlTemplate,
        pagination,
      },
      fieldMap,
    },
  };
}

export default { detectApiConfig, templateFromSample };
