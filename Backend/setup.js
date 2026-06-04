/**
 * @file setup.js
 * @description One-time setup:
 *   1. Test the MySQL connection.
 *   2. Run database/schema.sql to create tables.
 *   3. Create folders: profiles/, downloads/, logs/.
 *   4. Ensure profiles/template.json exists.
 *   5. Print success + next steps.
 *
 * Usage: `npm run setup`
 *
 * NOTE: The target database (DB_DATABASE) must already exist. setup.js creates
 * the *tables* inside it, not the database itself (most managed MySQL hosts do
 * not allow CREATE DATABASE for app users).
 */

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import { raw, testConnection, closePool } from './config/database.js';
import { CONSTANTS } from './config/constants.js';
import { ensureDirSync } from './utils/file-manager.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** A minimal template profile written if one doesn't already exist. */
const TEMPLATE_PROFILE = {
  profileId: 'profile_template',
  profileName: 'Template Profile (copy me)',
  urlPattern: 'https://example\\.com/product/\\d+',
  domain: 'example.com',
  createdAt: '1970-01-01T00:00:00Z',
  updatedAt: '1970-01-01T00:00:00Z',
  downloadImages: true,
  fields: {
    title: { selector: 'h1', type: 'text', required: true, fallback: '.product-title' },
    price: { selector: '.price', type: 'text', required: false, fallback: '[data-price]' },
    description: { selector: '.description', type: 'html', required: false },
    sku: { selector: '.sku', type: 'text', required: false },
  },
  selectors: {
    images: 'img.product-image',
    waitForSelector: '.product-container',
    timeout: 10000,
  },
  usageCount: 0,
};

async function step(label, fn) {
  process.stdout.write(chalk.cyan(`• ${label} … `));
  try {
    const detail = await fn();
    console.log(chalk.green('OK') + (detail ? chalk.gray(`  ${detail}`) : ''));
    return true;
  } catch (err) {
    console.log(chalk.red('FAILED'));
    console.log(chalk.red(`    ${err.message}`));
    return false;
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🛠️  Product Monitor — Setup\n'));
  console.log(
    chalk.gray(
      `Target: ${process.env.DB_USERNAME}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE} (MySQL)\n`,
    ),
  );

  // 1. Connection.
  const connected = await step('Testing database connection', async () => {
    await testConnection();
    return 'reachable';
  });
  if (!connected) {
    logger.error('Setup aborted — fix DB credentials in .env and re-run.');
    await closePool().catch(() => {});
    process.exit(1);
  }

  // 2. Schema.
  await step('Creating tables from schema.sql', async () => {
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const sql = await fs.readFile(schemaPath, 'utf8');
    await raw(sql);
    return 'tables ready';
  });

  // 3. Folders.
  await step('Creating folders (profiles/, downloads/, logs/)', async () => {
    ensureDirSync(CONSTANTS.PROFILES_DIR);
    ensureDirSync(CONSTANTS.DOWNLOADS_DIR);
    ensureDirSync(CONSTANTS.LOGS_DIR);
    return null;
  });

  // 4. Template.
  await step('Ensuring profiles/template.json', async () => {
    const tplPath = path.join(CONSTANTS.PROFILES_DIR, 'template.json');
    if (!fssync.existsSync(tplPath)) {
      await fs.writeFile(tplPath, JSON.stringify(TEMPLATE_PROFILE, null, 2) + '\n');
      return 'created';
    }
    return 'already exists';
  });

  // 5. Verify tables exist.
  await step('Verifying tables', async () => {
    const rows = await raw(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name IN ('products','crawl_history','pending_mappings')`,
    );
    return `${rows.length}/3 tables present`;
  });

  await closePool().catch(() => {});

  console.log(chalk.bold.green('\n✅ Setup complete!\n'));
  console.log(chalk.bold('Next steps:'));
  console.log(`  1. Create a mapping profile:   ${chalk.cyan('npm run create-mapping')}`);
  console.log(`  2. (or) Validate existing ones: ${chalk.cyan('npm run validate-mappings')}`);
  console.log(`  3. Set LISTING_URLS in .env (comma-separated).`);
  console.log(`  4. Do a one-off run:           ${chalk.cyan('npm run manual-run')}`);
  console.log(`  5. Start the 2-hour scheduler: ${chalk.cyan('npm start')}\n`);
}

main().catch(async (err) => {
  logger.error(`Setup failed: ${err.message}`, { stack: err.stack });
  await closePool().catch(() => {});
  process.exit(1);
});
