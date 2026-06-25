/**
 * Offline unit tests for mapLimit.
 * Run: node --test utils/concurrency.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from './concurrency.js';

test('preserves order regardless of completion timing', async () => {
  const out = await mapLimit([30, 10, 20], 3, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    return i;
  });
  assert.deepEqual(out, [0, 1, 2]);
});

test('never exceeds the concurrency limit', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await mapLimit(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
  });
  assert.ok(maxInFlight <= 3, `maxInFlight was ${maxInFlight}`);
});

test('runs every item', async () => {
  const seen = [];
  await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
    seen.push(x);
  });
  assert.deepEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('limit < 1 is coerced to 1; empty input is a no-op', async () => {
  assert.deepEqual(await mapLimit([1, 2], 0, async (x) => x * 2), [2, 4]);
  assert.deepEqual(await mapLimit([], 5, async (x) => x), []);
});
