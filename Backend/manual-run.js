/**
 * @file manual-run.js
 * @description Manual trigger script. Two modes:
 *
 *   1. One-off crawl (no override flags):
 *        npm run manual-run
 *        node manual-run.js --listing=https://101lab.co/buyer-marketplace
 *
 *   2. Manual override — force a specific profile for a single product URL:
 *        npm run manual-override -- --url=https://101lab.co/buyer-marketplace/2473 --profile=profile_101lab.json
 *
 *      This scrapes the URL with the forced profile and records/updates the
 *      product's profile_file_name in the database.
 */

import { runCrawlForListing, processProductUrl } from './scheduler/job-runner.js';
import { fetchApiProductByExternalId } from './scrapers/api-client.js';
import { readProfile, profileExists } from './utils/file-manager.js';
import { setProductProfile } from './database/queries.js';
import { launchBrowser, closeBrowser } from './config/puppeteer.js';
import { testConnection, closePool } from './config/database.js';
import { CONSTANTS } from './config/constants.js';
import { isValidUrl } from './utils/validators.js';
import { logger } from './utils/logger.js';

/**
 * Parse `--key=value` and bare flags from argv.
 * @returns {Record<string, string|boolean>}
 */
function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/** Run the manual-override flow for a single URL + profile. */
async function runOverride(url, profileFile) {
  if (!isValidUrl(url)) {
    logger.error(`Invalid --url: ${url}`);
    process.exit(1);
  }
  let fileName = profileFile;
  if (!fileName.endsWith('.json')) fileName += '.json';
  if (!profileExists(fileName)) {
    logger.error(`Profile not found: ${fileName} (in profiles/)`);
    process.exit(1);
  }

  const profile = await readProfile(fileName);
  logger.info(`🔧 Manual override: ${url} → ${fileName}`);

  // Persist the chosen profile first so it's recorded even if scrape fails.
  await setProductProfile(url, fileName);

  // ── API-source override: fetch the record from the API by its external id ──
  if (profile.source === 'api') {
    const externalId = url.split('/').filter(Boolean).pop();
    logger.info(`Looking up external id ${externalId} via API…`);
    const data = await fetchApiProductByExternalId(externalId, profile);
    if (!data) {
      logger.error(`No API record found for id ${externalId}.`);
      process.exit(1);
    }
    const result = await processProductUrl(data.productUrl, null, {
      forcedProfile: { fileName, profile },
      preExtracted: data,
    });
    logger.success(
      result.status === 'saved'
        ? `Override complete — product ID ${result.productId}.`
        : `Override finished with status: ${result.status}`,
    );
    return;
  }

  // ── DOM-source override ─────────────────────────────────────────────────────
  const browser = await launchBrowser();
  try {
    const result = await processProductUrl(url, browser, {
      forcedProfile: { fileName, profile },
    });
    if (result.status === 'saved') {
      logger.success(`Override complete — product ID ${result.productId}.`);
    } else {
      logger.warn(`Override finished with status: ${result.status}`);
    }
  } finally {
    await closeBrowser(browser);
  }
}

/** Run a one-off crawl over one or all listing URLs. */
async function runOneOff(listingArg) {
  const listings = listingArg
    ? [listingArg]
    : CONSTANTS.LISTING_URLS.length
      ? CONSTANTS.LISTING_URLS
      : ['https://101lab.co/buyer-marketplace'];

  const browser = await launchBrowser();
  try {
    for (const listing of listings) {
      // eslint-disable-next-line no-await-in-loop
      await runCrawlForListing(listing, { browser });
    }
  } finally {
    await closeBrowser(browser);
  }
}

async function main() {
  const args = parseArgs();

  // Verify DB up front.
  try {
    await testConnection();
  } catch (err) {
    logger.error(`Cannot connect to database: ${err.message}`);
    process.exit(1);
  }

  // Override mode: triggered by --override OR by presence of --url & --profile.
  if (args.override || (args.url && args.profile)) {
    if (!args.url || !args.profile) {
      logger.error(
        'Override mode requires --url=<product-url> and --profile=<file.json>',
      );
      process.exit(1);
    }
    await runOverride(args.url, args.profile);
  } else {
    await runOneOff(args.listing);
  }
}

main()
  .catch((err) => {
    logger.error(`manual-run failed: ${err.message}`, { stack: err.stack });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
