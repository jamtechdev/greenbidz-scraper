/**
 * @file manual-mapping/validate-profile.js
 * @description Validate all (or one) JSON mapping profiles — structural checks
 *              plus optional live selector verification against a sample URL.
 *
 *              Usage:
 *                npm run validate-mappings                 # structural checks on all
 *                node manual-mapping/validate-profile.js --file=profile_101lab.json
 *                node manual-mapping/validate-profile.js --live   # also test selectors live
 */

import chalk from 'chalk';
import { readAllProfiles, readProfile, listProfileFiles } from '../utils/file-manager.js';
import { validateProfile } from '../utils/validators.js';
import { goto, newPage, launchBrowser, closeBrowser } from '../config/puppeteer.js';
import { logger } from '../utils/logger.js';

/**
 * Parse CLI args into a simple flags object.
 * @returns {{ file?: string, live: boolean }}
 */
function parseArgs() {
  const out = { live: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--live') out.live = true;
    else if (arg.startsWith('--file=')) out.file = arg.slice('--file='.length);
  }
  return out;
}

/**
 * Live-test a profile's selectors against its sample/example URL.
 * Requires the profile to carry a `sampleUrl` or we synthesise one is skipped.
 * @param {object} profile
 * @param {import('puppeteer').Browser} browser
 * @returns {Promise<{ tested: boolean, results: object }>}
 */
async function liveTest(profile, browser) {
  const sampleUrl = profile.sampleUrl || profile.exampleUrl;
  if (!sampleUrl) {
    return { tested: false, results: {} };
  }
  const page = await newPage(browser);
  try {
    await goto(page, sampleUrl);
    if (profile.selectors?.waitForSelector) {
      await page
        .waitForSelector(profile.selectors.waitForSelector, { timeout: 15000 })
        .catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 2000));

    const results = await page.evaluate((fields) => {
      const out = {};
      for (const [name, def] of Object.entries(fields || {})) {
        let found = false;
        try {
          found = !!document.querySelector(def.selector);
        } catch {
          found = false;
        }
        out[name] = found;
      }
      return out;
    }, profile.fields);

    return { tested: true, results };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Main entry. */
async function run() {
  const { file, live } = parseArgs();
  console.log(chalk.cyan.bold('\n🔎 Validating mapping profiles\n'));

  const entries = file
    ? [{ fileName: file, profile: await readProfile(file).catch((e) => ({ __error: e.message })) }]
    : await readAllProfiles();

  if (!entries.length) {
    logger.warn('No profiles found.');
    const files = await listProfileFiles();
    logger.info(`profiles/ contains: ${files.join(', ') || '(none)'}`);
    return;
  }

  let browser = null;
  if (live) browser = await launchBrowser();

  let failures = 0;
  try {
    for (const { fileName, profile, error } of entries) {
      if (error || (profile && profile.__error)) {
        logger.error(`${fileName}: parse error — ${error || profile.__error}`);
        failures += 1;
        continue;
      }

      const { valid, errors } = validateProfile(profile);
      if (valid) {
        logger.success(`${fileName}: structure OK`);
      } else {
        failures += 1;
        logger.error(`${fileName}: ${errors.length} issue(s)`);
        errors.forEach((e) => console.log(chalk.red(`    - ${e}`)));
      }

      if (live && valid && browser) {
        const { tested, results } = await liveTest(profile, browser);
        if (!tested) {
          console.log(
            chalk.gray(
              '    (live: skipped — add "sampleUrl" to the profile to enable)',
            ),
          );
        } else {
          for (const [name, ok] of Object.entries(results)) {
            console.log(
              ok
                ? chalk.green(`    ✓ ${name} selector matched`)
                : chalk.yellow(`    ✗ ${name} selector found nothing`),
            );
          }
        }
      }
    }
  } finally {
    await closeBrowser(browser);
  }

  console.log();
  if (failures) {
    logger.error(`${failures} profile(s) failed validation.`);
    process.exit(1);
  } else {
    logger.success('All profiles valid.');
  }
}

run().catch((err) => {
  logger.error(`validate-profile failed: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

export default run;
