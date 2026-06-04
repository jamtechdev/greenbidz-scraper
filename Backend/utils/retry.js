/**
 * @file utils/retry.js
 * @description Generic async retry wrapper with exponential backoff.
 */

import { logger } from './logger.js';

/**
 * Sleep for a number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run an async function, retrying on failure with exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn - The async operation to attempt.
 * @param {object} [options]
 * @param {number} [options.retries=3] - Max attempts after the first try.
 * @param {number} [options.delayMs=2000] - Base delay before first retry.
 * @param {number} [options.factor=2] - Backoff multiplier per attempt.
 * @param {string} [options.label='operation'] - Human label for logs.
 * @param {(err: Error, attempt: number) => void} [options.onRetry] - Hook.
 * @returns {Promise<T>} Resolves with fn's result, or rejects after exhausting retries.
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    delayMs = 2000,
    factor = 2,
    label = 'operation',
    onRetry,
  } = options;

  let lastError;
  // Total attempts = 1 initial + `retries` retries.
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const isLast = attempt === retries + 1;
      if (isLast) break;

      const wait = delayMs * factor ** (attempt - 1);
      logger.warn(
        `${label} failed (attempt ${attempt}/${retries + 1}): ${err.message}. ` +
          `Retrying in ${wait}ms…`,
      );
      if (onRetry) onRetry(err, attempt);
      await sleep(wait);
    }
  }
  throw lastError;
}

export default withRetry;
