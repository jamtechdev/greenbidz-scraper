/**
 * @file scheduler/schedule-util.js
 * @description Shared per-profile scheduling math, used by both the crawl
 * scheduler (scheduler-manager.js) and the /api/profiles controller so the
 * "is this profile due?" / "when does it run next?" logic is computed identically
 * in both places.
 *
 * A profile's cadence is measured from its OWN last scrape (the MAX
 * crawl_history.timestamp across its listingUrls), falling back to its added
 * time (createdAt) when it has never been scraped. Each profile carries its own
 * `scrapeIntervalMinutes`; absent that, the global default applies.
 */
import { CONSTANTS } from '../config/constants.js';

const MIN_MS = 60 * 1000;

/** Effective interval in minutes: the profile's own value, else global default. */
export function intervalMinutesOf(profile) {
  const v = Number(profile?.scrapeIntervalMinutes);
  return Number.isFinite(v) && v >= 1 ? v : CONSTANTS.CRAWL_DEFAULT_INTERVAL_MINUTES;
}

/**
 * Latest scrape time for a profile = MAX(crawl_history.timestamp) over its
 * listingUrls. `lastByUrl` is a Map(listing_url → timestamp string/Date).
 * @returns {number|null} epoch ms, or null if none of its URLs have crawled.
 */
export function lastScrapeMsOf(profile, lastByUrl) {
  const urls = Array.isArray(profile?.listingUrls) ? profile.listingUrls : [];
  let max = null;
  for (const url of urls) {
    const ts = lastByUrl?.get(url);
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (Number.isFinite(ms) && (max == null || ms > max)) max = ms;
  }
  return max;
}

/**
 * Scheduling base = last scrape, else added time (createdAt), else null.
 * @returns {number|null} epoch ms.
 */
export function scheduleBaseMs(profile, lastByUrl, createdAt) {
  const last = lastScrapeMsOf(profile, lastByUrl);
  if (last != null) return last;
  if (createdAt) {
    const ms = new Date(createdAt).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Is the profile due to run at `now` (epoch ms)? A profile with no base at all
 * (never scraped, no createdAt) is treated as due immediately.
 */
export function isDue(profile, lastByUrl, createdAt, now) {
  const base = scheduleBaseMs(profile, lastByUrl, createdAt);
  if (base == null) return true;
  return now - base >= intervalMinutesOf(profile) * MIN_MS;
}

/**
 * Next run time (epoch ms), clamped to be >= now. When there is no base the
 * profile is due now, so `now` is returned.
 */
export function nextRunMs(profile, lastByUrl, createdAt, now) {
  const base = scheduleBaseMs(profile, lastByUrl, createdAt);
  if (base == null) return now;
  return Math.max(base + intervalMinutesOf(profile) * MIN_MS, now);
}

export default { intervalMinutesOf, lastScrapeMsOf, scheduleBaseMs, isDue, nextRunMs };
