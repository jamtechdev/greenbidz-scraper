/**
 * @file services/crawlJob.js
 * @description Start a background crawl over listing URLs as a tracked job so
 * the UI can poll /api/scrape-progress for live progress.
 */
import { createJob, jobProgress, isCancelled, finishJob, failJob } from '../web/jobs.js';
import { runCrawlForListing } from '../scheduler/job-runner.js';
import { logger } from '../utils/logger.js';

/**
 * @param {string[]} listingUrls
 * @returns {string} jobId
 */
export function startCrawlJob(listingUrls) {
  const jobId = createJob({ listingUrls });
  const onProgress = jobProgress(jobId);
  const shouldStop = () => isCancelled(jobId);
  (async () => {
    try {
      for (const u of listingUrls) {
        if (isCancelled(jobId)) break;
        try {
          logger.info(`▶️  Job ${jobId} crawl: ${u}`);
          await runCrawlForListing(u, { onProgress, shouldStop });
        } catch (err) {
          logger.warn(`Job ${jobId} crawl failed for ${u}: ${err.message}`);
        }
      }
      if (isCancelled(jobId)) finishJob(jobId, { status: 'cancelled', phase: 'cancelled' });
      else finishJob(jobId);
    } catch (err) {
      failJob(jobId, err.message);
    }
  })();
  return jobId;
}
