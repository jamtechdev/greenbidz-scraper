/**
 * @file detectors/diff-analyzer.js
 * @description Compare freshly-crawled product URLs against what has already
 *              been seen in the database to isolate the NEW ones.
 */

import { getSeenUrls } from '../database/queries.js';

/**
 * Given a list of currently-found product URLs, return which are new vs. known.
 *
 * @param {Iterable<string>} currentUrls - URLs found in this crawl.
 * @returns {Promise<{ newUrls: string[], existingUrls: string[], seenCount: number }>}
 */
export async function diffNewProducts(currentUrls) {
  const seen = await getSeenUrls();
  const current = Array.from(new Set(currentUrls)); // dedupe defensively

  const newUrls = [];
  const existingUrls = [];

  for (const url of current) {
    if (seen.has(url)) existingUrls.push(url);
    else newUrls.push(url);
  }

  return { newUrls, existingUrls, seenCount: seen.size };
}

/**
 * Pure (DB-free) diff helper — useful for tests.
 * @param {string[]} currentUrls
 * @param {Set<string>} seenSet
 * @returns {{ newUrls: string[], existingUrls: string[] }}
 */
export function diffAgainstSet(currentUrls, seenSet) {
  const newUrls = [];
  const existingUrls = [];
  for (const url of new Set(currentUrls)) {
    if (seenSet.has(url)) existingUrls.push(url);
    else newUrls.push(url);
  }
  return { newUrls, existingUrls };
}

export default { diffNewProducts, diffAgainstSet };
