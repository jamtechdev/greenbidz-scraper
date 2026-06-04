/**
 * @file detectors/url-pattern-matcher.js
 * @description Convert URLs into regex patterns and find the profile whose
 *              `urlPattern` matches a given product URL.
 */

import { readAllProfiles } from '../utils/file-manager.js';
import { extractDomain } from '../utils/validators.js';

/**
 * Convert a concrete URL into a generalised regex pattern by replacing numeric
 * path/identifier segments with `\d+`.
 *
 * Examples:
 *   https://example.com/product/123        -> https://example.com/product/\d+
 *   https://101lab.co/buyer-marketplace/2473 -> https://101lab.co/buyer-marketplace/\d+
 *   https://shop.com/p/abc-987/details      -> https://shop.com/p/abc-\d+/details
 *
 * Query strings are dropped from the pattern (they vary too much to anchor on).
 *
 * @param {string} url
 * @returns {string} A regex source string.
 */
export function extractUrlPattern(url) {
  let working = url;

  // Strip query string and hash for pattern purposes.
  const queryIdx = working.search(/[?#]/);
  if (queryIdx !== -1) working = working.slice(0, queryIdx);

  // Escape regex-significant characters EXCEPT digits (we'll handle those).
  // First escape everything, then turn escaped digit-runs into \d+.
  const escaped = working.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace any run of one or more digits with \d+.
  const pattern = escaped.replace(/\d+/g, '\\d+');

  return pattern;
}

/**
 * Build an anchored RegExp from a pattern string.
 * @param {string} pattern
 * @returns {RegExp}
 */
export function toRegExp(pattern) {
  // Anchor so partial matches don't produce false positives.
  return new RegExp(`^${pattern}$`);
}

/**
 * Test whether a URL matches a profile's urlPattern.
 * @param {string} url
 * @param {object} profile
 * @returns {boolean}
 */
export function profileMatchesUrl(url, profile) {
  if (!profile || !profile.urlPattern) return false;
  try {
    // The stored pattern may or may not be anchored; test both ways.
    const re = new RegExp(profile.urlPattern);
    return re.test(url);
  } catch {
    return false;
  }
}

/**
 * Find the mapping profile that matches a given product URL.
 *
 * Strategy:
 *   1. Prefer a profile whose `urlPattern` regex matches the URL.
 *   2. If several match, prefer the one whose `domain` equals the URL host
 *      and whose pattern is the most specific (longest).
 *
 * @param {string} url
 * @returns {Promise<{ fileName: string, profile: object } | null>}
 */
export async function findMatchingProfile(url) {
  const all = await readAllProfiles();
  const domain = extractDomain(url);

  const candidates = all
    .filter((entry) => entry.profile && profileMatchesUrl(url, entry.profile))
    .map((entry) => ({
      ...entry,
      domainMatch: entry.profile.domain === domain,
      specificity: (entry.profile.urlPattern || '').length,
    }));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.domainMatch !== b.domainMatch) return a.domainMatch ? -1 : 1;
    return b.specificity - a.specificity;
  });

  const best = candidates[0];
  return { fileName: best.fileName, profile: best.profile };
}

/**
 * Find an API-source profile that is responsible for a given listing URL.
 *
 * A profile claims a listing if it has `source === "api"` and either:
 *   - its top-level `listingUrls` array includes the URL, or
 *   - its `domain` equals the listing URL's host.
 *
 * @param {string} listingUrl
 * @returns {Promise<{ fileName: string, profile: object } | null>}
 */
export async function findApiProfileForListing(listingUrl) {
  const all = await readAllProfiles();
  const host = extractDomain(listingUrl);

  for (const entry of all) {
    const p = entry.profile;
    if (!p || p.source !== 'api') continue;
    const listingUrls = Array.isArray(p.listingUrls) ? p.listingUrls : [];
    if (listingUrls.includes(listingUrl) || p.domain === host) {
      return { fileName: entry.fileName, profile: p };
    }
  }
  return null;
}

/**
 * Find a DOM-source profile responsible for a given listing URL, so the crawler
 * can use that profile's `pagination` config (product-link + Next selectors)
 * instead of the hardcoded defaults.
 *
 * A DOM profile claims a listing if it has `source !== "api"` and either:
 *   - its `listingUrls` array includes the URL, or
 *   - its `domain` equals the listing URL's host.
 *
 * @param {string} listingUrl
 * @returns {Promise<{ fileName: string, profile: object } | null>}
 */
export async function findDomProfileForListing(listingUrl) {
  const all = await readAllProfiles();
  const host = extractDomain(listingUrl);

  let domainFallback = null;
  for (const entry of all) {
    const p = entry.profile;
    if (!p || p.source === 'api') continue;
    const listingUrls = Array.isArray(p.listingUrls) ? p.listingUrls : [];
    if (listingUrls.includes(listingUrl)) {
      return { fileName: entry.fileName, profile: p };
    }
    if (!domainFallback && p.domain === host && p.pagination) {
      domainFallback = { fileName: entry.fileName, profile: p };
    }
  }
  return domainFallback;
}

export default {
  extractUrlPattern,
  toRegExp,
  profileMatchesUrl,
  findMatchingProfile,
  findApiProfileForListing,
  findDomProfileForListing,
};
