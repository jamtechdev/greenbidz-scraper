/**
 * @file main.js
 * @description Entry point. Starts the recurring scheduler.
 *
 *              The scheduler does NOT blanket-crawl .env LISTING_URLS and does
 *              NOT run on startup. It only auto-crawls profiles the admin marked
 *              "with job" (scrapeMode === 'auto'), every CRAWL_INTERVAL_HOURS.
 *              One-time profiles are run once at save-time (by the web API) and
 *              are never auto-crawled here.
 *
 * Usage: `npm start`
 */

import { startScheduler } from './scheduler/job-runner.js';
import { readAllProfiles } from './utils/file-manager.js';
import { CONSTANTS } from './config/constants.js';
import { testSequelize, sequelize } from './config/sequelize.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('🚀 Product Monitor starting…');

  // Fail fast if the DB is unreachable.
  try {
    await testSequelize();
    logger.success('Database connection OK.');
  } catch (err) {
    logger.error(`Cannot connect to database: ${err.message}`, { stack: err.stack });
    logger.error('Run `npm run db:migrate` and check your .env credentials.');
    process.exit(1);
  }

  // Report which profiles will be auto-crawled (purely informational).
  const profiles = await readAllProfiles().catch(() => []);
  const auto = profiles.filter((p) => p.profile && p.profile.scrapeMode === 'auto');
  if (auto.length) {
    logger.info(`"With job" profiles that auto-crawl every ${CONSTANTS.CRAWL_INTERVAL_HOURS}h:`);
    auto.forEach((p) => logger.info(`   • ${p.fileName}`));
  } else {
    logger.info(
      'No "with job" profiles yet — nothing will auto-crawl. ' +
        'Create one in the UI (New Scraper → scrape mode: with job).',
    );
  }

  const task = startScheduler({ runImmediately: false });

  // Graceful shutdown.
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down…`);
    try {
      task.stop();
    } catch {
      /* ignore */
    }
    await sequelize.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
