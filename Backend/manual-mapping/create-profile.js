/**
 * @file manual-mapping/create-profile.js
 * @description Interactive CLI to create a new JSON mapping profile.
 *              Run via: `npm run create-mapping`.
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { writeProfile, profileExists } from '../utils/file-manager.js';
import { validateProfile, isValidRegex, extractDomain } from '../utils/validators.js';
import { extractUrlPattern } from '../detectors/url-pattern-matcher.js';
import { logger } from '../utils/logger.js';

/**
 * Build a profile object from collected answers.
 * @param {object} a - Answers.
 * @returns {object}
 */
function buildProfile(a) {
  const now = new Date().toISOString();
  const slug = (a.domain || 'site').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const stamp = now.replace(/[-:T.Z]/g, '').slice(0, 14);

  const fields = {
    title: {
      selector: a.titleSelector || 'h1',
      type: 'text',
      required: true,
    },
  };
  if (a.priceSelector) {
    fields.price = { selector: a.priceSelector, type: 'text', required: false };
  }
  if (a.descriptionSelector) {
    fields.description = {
      selector: a.descriptionSelector,
      type: 'html',
      required: false,
    };
  }
  if (a.skuSelector) {
    fields.sku = { selector: a.skuSelector, type: 'text', required: false };
  }

  return {
    profileId: `profile_${slug}_${stamp}`,
    profileName: a.profileName || `${a.domain} Product Scraper`,
    urlPattern: a.urlPattern,
    domain: a.domain,
    createdAt: now,
    updatedAt: now,
    downloadImages: a.downloadImages,
    fields,
    selectors: {
      images: a.imageSelector || 'img',
      waitForSelector: a.waitForSelector || 'h1',
      timeout: 10000,
    },
    usageCount: 0,
  };
}

/** Run the interactive creation flow. */
export async function manualMappingCreator() {
  console.log(chalk.cyan.bold('\n🧩 Create a new mapping profile\n'));

  const answers = await prompts(
    [
      {
        type: 'text',
        name: 'sampleUrl',
        message: 'Sample product URL (used to auto-suggest a pattern):',
        validate: (v) => (v && v.startsWith('http') ? true : 'Enter a valid URL'),
      },
      {
        type: 'text',
        name: 'urlPattern',
        message: 'URL pattern (regex):',
        initial: (prev) => (prev ? extractUrlPattern(prev) : ''),
        validate: (v) => (isValidRegex(v) ? true : 'Invalid regex'),
      },
      {
        type: 'text',
        name: 'domain',
        message: 'Domain name:',
        initial: (prev, values) => extractDomain(values.sampleUrl) || '',
      },
      {
        type: 'text',
        name: 'profileName',
        message: 'Profile display name:',
        initial: (prev, values) => `${values.domain} Product Scraper`,
      },
      {
        type: 'text',
        name: 'titleSelector',
        message: 'Title selector:',
        initial: 'h1',
      },
      {
        type: 'text',
        name: 'priceSelector',
        message: 'Price selector (optional, blank to skip):',
      },
      {
        type: 'text',
        name: 'descriptionSelector',
        message: 'Description selector (optional, blank to skip):',
      },
      {
        type: 'text',
        name: 'skuSelector',
        message: 'SKU selector (optional, blank to skip):',
      },
      {
        type: 'text',
        name: 'imageSelector',
        message: 'Image selector:',
        initial: 'img',
      },
      {
        type: 'text',
        name: 'waitForSelector',
        message: 'Wait-for selector (element that signals the page is ready):',
        initial: 'h1',
      },
      {
        type: 'toggle',
        name: 'downloadImages',
        message: 'Download images?',
        initial: true,
        active: 'yes',
        inactive: 'no',
      },
    ],
    { onCancel: () => process.exit(1) },
  );

  const profile = buildProfile(answers);

  // Validate before writing.
  const { valid, errors } = validateProfile(profile);
  if (!valid) {
    logger.error(`Profile invalid:\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }

  // Decide filename.
  const fileNameAnswer = await prompts({
    type: 'text',
    name: 'fileName',
    message: 'Save as filename:',
    initial: `profile_${(answers.domain || 'site').replace(/[^a-z0-9]+/gi, '').toLowerCase()}.json`,
  });
  let fileName = fileNameAnswer.fileName;
  if (!fileName.endsWith('.json')) fileName += '.json';

  if (profileExists(fileName)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `${fileName} already exists. Overwrite?`,
      initial: false,
    });
    if (!overwrite) {
      logger.warn('Aborted — file not overwritten.');
      process.exit(0);
    }
  }

  const full = await writeProfile(fileName, profile);
  logger.success(`Created profile: ${full}`);
  console.log(chalk.gray(JSON.stringify(profile, null, 2)));
}

// Run when invoked directly.
manualMappingCreator().catch((err) => {
  logger.error(`create-profile failed: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

export default manualMappingCreator;
