/**
 * @file manual-mapping/edit-profile.js
 * @description Interactive CLI to edit an existing JSON mapping profile.
 *              Run via: `npm run edit-mapping`.
 */

import prompts from 'prompts';
import chalk from 'chalk';
import {
  listProfileFiles,
  readProfile,
  writeProfile,
} from '../utils/file-manager.js';
import { validateProfile, isValidRegex } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/** Edit a single field's selector definition interactively. */
async function editFields(profile) {
  const fields = { ...(profile.fields || {}) };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const choices = [
      ...Object.keys(fields).map((k) => ({
        title: `${k}  (${fields[k].selector})`,
        value: k,
      })),
      { title: chalk.green('+ add new field'), value: '__add__' },
      { title: chalk.gray('done editing fields'), value: '__done__' },
    ];
    const { field } = await prompts({
      type: 'select',
      name: 'field',
      message: 'Edit which field?',
      choices,
    });

    if (!field || field === '__done__') break;

    if (field === '__add__') {
      const added = await prompts([
        { type: 'text', name: 'name', message: 'New field name:' },
        { type: 'text', name: 'selector', message: 'Selector:' },
        {
          type: 'select',
          name: 'type',
          message: 'Type:',
          choices: [
            { title: 'text', value: 'text' },
            { title: 'html', value: 'html' },
            { title: 'attr', value: 'attr' },
            { title: 'number', value: 'number' },
          ],
        },
        { type: 'toggle', name: 'required', message: 'Required?', initial: false, active: 'yes', inactive: 'no' },
      ]);
      if (added.name) {
        fields[added.name] = {
          selector: added.selector,
          type: added.type,
          required: added.required,
        };
      }
      continue;
    }

    const current = fields[field];
    const updated = await prompts([
      {
        type: 'text',
        name: 'selector',
        message: `Selector for "${field}":`,
        initial: current.selector,
      },
      {
        type: 'text',
        name: 'fallback',
        message: 'Fallback selector (optional):',
        initial: current.fallback || '',
      },
    ]);
    fields[field] = {
      ...current,
      selector: updated.selector,
      ...(updated.fallback ? { fallback: updated.fallback } : {}),
    };
  }

  return fields;
}

/** Run the interactive edit flow. */
export async function editProfileFlow() {
  console.log(chalk.cyan.bold('\n✏️  Edit a mapping profile\n'));

  const files = await listProfileFiles();
  if (!files.length) {
    logger.warn('No profiles found in the profiles/ directory.');
    process.exit(0);
  }

  const { fileName } = await prompts({
    type: 'select',
    name: 'fileName',
    message: 'Select a profile to edit:',
    choices: files.map((f) => ({ title: f, value: f })),
  });
  if (!fileName) process.exit(0);

  const profile = await readProfile(fileName);

  const top = await prompts([
    {
      type: 'text',
      name: 'profileName',
      message: 'Profile name:',
      initial: profile.profileName,
    },
    {
      type: 'text',
      name: 'urlPattern',
      message: 'URL pattern (regex):',
      initial: profile.urlPattern,
      validate: (v) => (isValidRegex(v) ? true : 'Invalid regex'),
    },
    {
      type: 'text',
      name: 'imageSelector',
      message: 'Image selector:',
      initial: profile.selectors?.images || 'img',
    },
    {
      type: 'text',
      name: 'waitForSelector',
      message: 'Wait-for selector:',
      initial: profile.selectors?.waitForSelector || 'h1',
    },
    {
      type: 'toggle',
      name: 'downloadImages',
      message: 'Download images?',
      initial: profile.downloadImages ?? true,
      active: 'yes',
      inactive: 'no',
    },
  ]);

  const fields = await editFields(profile);

  const updated = {
    ...profile,
    profileName: top.profileName,
    urlPattern: top.urlPattern,
    downloadImages: top.downloadImages,
    updatedAt: new Date().toISOString(),
    fields,
    selectors: {
      ...(profile.selectors || {}),
      images: top.imageSelector,
      waitForSelector: top.waitForSelector,
    },
  };

  const { valid, errors } = validateProfile(updated);
  if (!valid) {
    logger.error(`Profile invalid:\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }

  const full = await writeProfile(fileName, updated);
  logger.success(`Updated profile: ${full}`);
}

editProfileFlow().catch((err) => {
  logger.error(`edit-profile failed: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

export default editProfileFlow;
