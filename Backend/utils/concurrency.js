/**
 * @file utils/concurrency.js
 * @description Tiny dependency-free concurrency limiter. Runs an async fn over a
 *   list with at most `limit` in flight at once, preserving result order. Used to
 *   scrape several product pages in parallel (shared browser, one page each)
 *   without pulling in an external queue.
 */

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit - Max concurrent invocations (coerced to >= 1).
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>} Results in the same order as `items`.
 */
export async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Math.floor(limit) || 1);
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, list.length) }, async () => {
    while (cursor < list.length) {
      const idx = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      results[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export default { mapLimit };
