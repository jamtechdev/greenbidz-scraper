/**
 * Offline unit tests for selectCategoryUrls.
 * Run: node --test scrapers/category-crawler.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCategoryUrls } from './category-crawler.js';

const ORIGIN = 'https://shop.com';

test('keeps only same-origin URLs matching a category pattern', () => {
  const hrefs = [
    'https://shop.com/category/tools',
    'https://shop.com/category/lab',
    'https://other.com/category/x', // different origin
    'https://shop.com/about', // not a category
  ];
  const out = selectCategoryUrls(hrefs, { categoryPatterns: ['/category/'], origin: ORIGIN });
  assert.deepEqual(out, ['https://shop.com/category/tools', 'https://shop.com/category/lab']);
});

test('excludes product URLs even if they match a category pattern', () => {
  const hrefs = ['https://shop.com/category/tools', 'https://shop.com/category/item/123'];
  const out = selectCategoryUrls(hrefs, {
    categoryPatterns: ['/category/'],
    origin: ORIGIN,
    productPattern: '/item/\\d+',
  });
  assert.deepEqual(out, ['https://shop.com/category/tools']);
});

test('dedupes repeats', () => {
  const hrefs = ['https://shop.com/c/a', 'https://shop.com/c/a', 'https://shop.com/c/b'];
  const out = selectCategoryUrls(hrefs, { categoryPatterns: ['/c/'], origin: ORIGIN });
  assert.equal(out.length, 2);
});

test('no patterns → returns nothing (safe default)', () => {
  assert.deepEqual(selectCategoryUrls(['https://shop.com/c/a'], { categoryPatterns: [], origin: ORIGIN }), []);
});

test('accepts RegExp patterns and multiple patterns', () => {
  const hrefs = ['https://shop.com/c/a', 'https://shop.com/collections/b', 'https://shop.com/x'];
  const out = selectCategoryUrls(hrefs, { categoryPatterns: [/\/c\//, '/collections/'], origin: ORIGIN });
  assert.deepEqual(out, ['https://shop.com/c/a', 'https://shop.com/collections/b']);
});
