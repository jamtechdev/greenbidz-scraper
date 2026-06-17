/**
 * @file controllers/profiles.controller.js — /api/profiles and friends.
 */
import { logger } from '../utils/logger.js';
import { isValidUrl, validateProfile } from '../utils/validators.js';
import {
  readAllProfiles,
  readProfile,
  writeProfile,
  profileExists,
  deleteProfile,
} from '../utils/file-manager.js';
import { getLastCrawlTimes, countProductsPerProfile } from '../database/queries.js';
import { startCrawlJob } from '../services/crawlJob.js';
import { intervalMinutesOf, nextRunMs } from '../scheduler/schedule-util.js';

/** Settings the Profiles page is allowed to change on an existing profile. */
const EDITABLE_SETTINGS = ['scrapeMode', 'scrapeLimit', 'downloadImages', 'paused', 'scrapeIntervalMinutes'];

/** GET /api/profiles */
export async function listProfiles(req, res) {
  const all = await readAllProfiles();

  const lastByUrl = new Map();
  try {
    for (const row of await getLastCrawlTimes()) {
      lastByUrl.set(row.listing_url, row.last_timestamp);
    }
  } catch (err) {
    logger.warn(`Could not load crawl times for profiles: ${err.message}`);
  }

  // Per-profile product health (best-effort — never block the profile list).
  let statsByFile = {};
  try {
    statsByFile = await countProductsPerProfile();
  } catch (err) {
    logger.warn(`Could not load per-profile product counts: ${err.message}`);
  }
  const now = Date.now();

  const profiles = all
    .filter((e) => e.profile)
    .map(({ fileName, profile, createdAt }) => {
      const listingUrls = Array.isArray(profile.listingUrls) ? profile.listingUrls : [];
      const paused = !!profile.paused;
      const scrapeMode = profile.scrapeMode || null;

      let lastScrapedAt = null;
      for (const url of listingUrls) {
        const ts = lastByUrl.get(url);
        if (ts && (!lastScrapedAt || new Date(ts) > new Date(lastScrapedAt))) lastScrapedAt = ts;
      }

      const stats = statsByFile[fileName] || { total: 0, scraped: 0, synced: 0, errored: 0 };

      // Per-profile next run = (last scrape, else added time) + this profile's
      // interval, clamped to now. Only meaningful for active auto profiles.
      const nextScrapeAt =
        scrapeMode === 'auto' && !paused
          ? new Date(nextRunMs(profile, lastByUrl, createdAt, now)).toISOString()
          : null;

      return {
        fileName,
        profileId: profile.profileId,
        profileName: profile.profileName,
        domain: profile.domain,
        source: profile.source || 'dom',
        scrapeMode,
        scrapeLimit: profile.scrapeLimit ?? null,
        scrapeIntervalMinutes: intervalMinutesOf(profile),
        downloadImages: !!profile.downloadImages,
        paused,
        urlPattern: profile.urlPattern,
        listingUrls,
        fieldCount: profile.fields ? Object.keys(profile.fields).length : 0,
        hasImages: !!(profile.selectors && profile.selectors.images),
        updatedAt: profile.updatedAt || null,
        lastScrapedAt,
        nextScrapeAt,
        // Per-profile product health (see countProductsPerProfile).
        productCount: stats.total,
        scrapedCount: stats.scraped,
        syncedCount: stats.synced,
        erroredCount: stats.errored,
      };
    });
  res.json({ profiles });
}

/** GET /api/profile?fileName= — full saved profile config (for editing in the Studio). */
export async function getProfileConfig(req, res) {
  const raw = req.query.fileName;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'fileName required.' });
  }
  const fn = raw.endsWith('.json') ? raw : `${raw}.json`;
  if (!(await profileExists(fn))) {
    return res.status(404).json({ error: `Profile not found: ${fn}` });
  }
  const config = await readProfile(fn);
  res.json({ fileName: fn, config });
}

/** POST /api/save-profile { fileName, profile, runNow? } */
export async function saveProfile(req, res) {
  const body = req.body || {};
  let { fileName } = body;
  const { profile } = body;
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'Missing profile object.' });
  }
  delete profile._suggestedFileName;
  profile.updatedAt = new Date().toISOString();

  const { valid, errors } = validateProfile(profile);
  if (!valid) {
    return res.status(400).json({ error: 'Profile invalid', details: errors });
  }

  const createNew = body.createNew === true;
  if (!fileName) {
    const slug = (profile.domain || 'site').replace(/[^a-z0-9]+/gi, '').toLowerCase();
    fileName = `profile_${slug}.json`;
    // Multiple profiles per domain: when explicitly creating a new one, find a
    // free suffixed filename instead of overwriting the existing profile.
    if (createNew) {
      let n = 2;
      let candidate = fileName;
      // eslint-disable-next-line no-await-in-loop
      while (await profileExists(candidate)) {
        candidate = `profile_${slug}_${n}.json`;
        n += 1;
      }
      fileName = candidate;
    }
  }
  if (!fileName.endsWith('.json')) fileName += '.json';
  // Keep the profileId aligned with the (possibly suffixed) filename so multiple
  // same-domain profiles stay distinct.
  profile.profileId = fileName.replace(/\.json$/, '');

  const overwrote = await profileExists(fileName);
  const full = await writeProfile(fileName, profile);
  logger.success(`Profile saved via UI: ${full}`);

  const listingUrls = Array.isArray(profile.listingUrls)
    ? profile.listingUrls.filter(isValidUrl)
    : [];
  const runNow = body.runNow !== false && listingUrls.length > 0;
  const jobId = runNow ? startCrawlJob(listingUrls) : null;

  res.json({ ok: true, fileName, overwrote, path: full, runStarted: !!jobId, jobId });
}

/** POST /api/profile-settings { fileName, settings } — partial settings update. */
export async function updateSettings(req, res) {
  const body = req.body || {};
  const { fileName, settings } = body;
  if (!fileName || typeof fileName !== 'string') {
    return res.status(400).json({ error: 'fileName required.' });
  }
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings object required.' });
  }
  const fn = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  if (!(await profileExists(fn))) {
    return res.status(404).json({ error: `Profile not found: ${fn}` });
  }

  const profile = await readProfile(fn);

  if ('scrapeMode' in settings) {
    if (settings.scrapeMode !== 'auto' && settings.scrapeMode !== 'manual') {
      return res.status(400).json({ error: "scrapeMode must be 'auto' or 'manual'." });
    }
    profile.scrapeMode = settings.scrapeMode;
  }
  if ('scrapeLimit' in settings) {
    const v = settings.scrapeLimit;
    if (v === null || v === '') {
      profile.scrapeLimit = null;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: 'scrapeLimit must be a positive integer or null.' });
      }
      profile.scrapeLimit = n;
    }
  }
  if ('scrapeIntervalMinutes' in settings) {
    const v = settings.scrapeIntervalMinutes;
    if (v === null || v === '') {
      // Clearing → fall back to the global default.
      delete profile.scrapeIntervalMinutes;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 20 || n > 1440) {
        return res
          .status(400)
          .json({ error: 'scrapeIntervalMinutes must be an integer between 20 and 1440 (minutes), or null.' });
      }
      profile.scrapeIntervalMinutes = n;
    }
  }
  if ('downloadImages' in settings) profile.downloadImages = !!settings.downloadImages;
  if ('paused' in settings) profile.paused = !!settings.paused;

  const unknown = Object.keys(settings).filter((k) => !EDITABLE_SETTINGS.includes(k));
  if (unknown.length) logger.warn(`Ignored non-editable profile settings: ${unknown.join(', ')}`);

  profile.updatedAt = new Date().toISOString();
  await writeProfile(fn, profile);
  logger.success(`Profile settings updated via UI: ${fn}`);

  res.json({
    ok: true,
    fileName: fn,
    settings: {
      scrapeMode: profile.scrapeMode || null,
      scrapeLimit: profile.scrapeLimit ?? null,
      scrapeIntervalMinutes: intervalMinutesOf(profile),
      downloadImages: !!profile.downloadImages,
      paused: !!profile.paused,
    },
  });
}

/** POST /api/delete-profile { fileName } */
export async function removeProfile(req, res) {
  const { fileName } = req.body || {};
  if (!fileName || typeof fileName !== 'string') {
    return res.status(400).json({ error: 'fileName required.' });
  }
  const fn = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  if (!(await profileExists(fn))) {
    return res.status(404).json({ error: `Profile not found: ${fn}` });
  }
  await deleteProfile(fn);
  logger.success(`Profile deleted via UI: ${fn}`);
  res.json({ ok: true, fileName: fn });
}

/** POST /api/run-profile { fileName } — crawl this profile's listing URL(s) now. */
export async function runProfile(req, res) {
  const { fileName } = req.body || {};
  if (!fileName || typeof fileName !== 'string') {
    return res.status(400).json({ error: 'fileName required.' });
  }
  const fn = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  if (!(await profileExists(fn))) {
    return res.status(404).json({ error: `Profile not found: ${fn}` });
  }
  const profile = await readProfile(fn);
  const listingUrls = (Array.isArray(profile.listingUrls) ? profile.listingUrls : []).filter(
    isValidUrl,
  );
  if (!listingUrls.length) {
    return res.status(400).json({
      error: 'This profile has no listingUrls to crawl. Re-build it in the Mapping Studio.',
    });
  }
  const jobId = startCrawlJob(listingUrls);
  res.json({ ok: true, runStarted: true, fileName: fn, listingUrls, jobId });
}
