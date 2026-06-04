/**
 * @file scrapers/image-downloader.js
 * @description Download remote product images to the local filesystem under
 *              downloads/{domain}/{productId}/. Uses the global fetch (Node 18+).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CONSTANTS } from '../config/constants.js';
import { extractDomain } from '../utils/validators.js';
import { ensureDir } from '../utils/file-manager.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/** Map a content-type to a file extension. */
const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

/**
 * Derive a safe filename for an image URL.
 * @param {string} url
 * @param {number} index
 * @param {string} contentType
 * @returns {string}
 */
function fileNameFor(url, index, contentType) {
  let ext = '';
  try {
    ext = path.extname(new URL(url).pathname);
  } catch {
    ext = '';
  }
  if (!ext && contentType) ext = EXT_BY_TYPE[contentType.split(';')[0]] || '';
  if (!ext) ext = '.jpg';
  return `image_${String(index + 1).padStart(2, '0')}${ext}`;
}

/**
 * Download a single image to a directory.
 * @param {string} url
 * @param {string} destDir
 * @param {number} index
 * @returns {Promise<string|null>} Local path written, or null on failure.
 */
async function downloadOne(url, destDir, index) {
  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,*/*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const contentType = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      const fileName = fileNameFor(url, index, contentType);
      const dest = path.join(destDir, fileName);
      await fs.writeFile(dest, buf);
      return dest;
    },
    { retries: 2, delayMs: 1000, label: `Download image ${url}` },
  ).catch((err) => {
    logger.warn(`Failed to download image ${url}: ${err.message}`);
    return null;
  });
}

/**
 * Download a set of images for a product.
 *
 * @param {string[]} imageUrls
 * @param {string|number} productId - Used as the folder name.
 * @param {object} [options]
 * @param {string} [options.domain] - Override domain folder; otherwise derived.
 * @param {string} [options.sourceUrl] - Product URL, used to derive domain.
 * @returns {Promise<string[]>} Array of local file paths actually written.
 */
export async function downloadImages(imageUrls, productId, options = {}) {
  if (!CONSTANTS.DOWNLOAD_IMAGES) {
    logger.debug('Image downloading disabled (DOWNLOAD_IMAGES=false).');
    return [];
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return [];

  const domain =
    options.domain ||
    (options.sourceUrl ? extractDomain(options.sourceUrl) : null) ||
    'unknown';

  const destDir = path.join(CONSTANTS.DOWNLOADS_DIR, domain, String(productId));
  await ensureDir(destDir);

  const results = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    // Skip data: URIs and obvious non-http sources.
    if (!/^https?:\/\//i.test(imageUrls[i])) continue;
    // eslint-disable-next-line no-await-in-loop
    const local = await downloadOne(imageUrls[i], destDir, i);
    if (local) results.push(local);
  }

  if (results.length) {
    logger.step('🖼️', `Downloaded ${results.length} image(s) to ${destDir}/`);
  }
  return results;
}

export default { downloadImages };
