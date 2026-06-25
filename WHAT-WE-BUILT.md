# Product-Scraper — What We Built & Problems Solved

Short summary of the work delivered against the improvement plan. All five planned
items are implemented, unit-tested, and type-checked.

> Note: the main-site **sync** push was intentionally not exercised in testing.
> Everything else is verified by unit tests, type-checks, and read-only smokes.

---

## The 3 original problems → what now solves them

### Problem 1 — Performance at scale (many sites, thousands of products)
**Before:** the scheduler scraped strictly one product at a time and re-scanned every
listing page in full on each run, so large catalogs fell behind.
**Now:**
- **Concurrent scraping** — up to `CRAWL_CONCURRENCY` (default 3) product pages are
  scraped in parallel over one browser.
- **Early-stop pagination** — listing crawls stop once they reach already-known
  products (after 2 consecutive "nothing new" pages) instead of paginating the whole
  catalog every time.
- Kept **in-process** (no external queue/Redis added) — the right call until
  multi-machine scale is actually needed.

### Problem 2 — Source changes weren't reflected on the main site
**Before:** "copy once and forget" — if a source changed a product's price or
description after we synced it, the main site kept the stale value.
**Now:**
- Each product gets a **content fingerprint** (hash of title + price + description).
- A product whose source changed is detected by comparing the current fingerprint to
  the one captured at last sync.
- A **"Changed Products"** review screen lists what changed, with one-click **re-sync**
  (updates the existing main-site listing — no duplicates).
- An optional **auto-detect scheduler** re-checks synced products on a schedule and can
  auto re-sync (off by default, so nothing pushes to the live site without you).

### Problem 3 — Different site structures / too many categories to map by hand
**Before:** you had to point the scraper at specific listing pages; sites with hundreds
of categories, or unusual layouts, were impractical and often skipped entirely.
**Now:** three discovery modes per site (chosen up front in the Mapping Studio):
- **Sitemap** — reads the site's XML sitemap to find every product at once, ignoring
  categories/pagination. A visual **Sitemap step** lets you browse sections and click a
  sample to set the product (and category) pattern, with a live match count.
- **Category** — discovers category links from one start page and crawls each.
- **Auto** — tries the sitemap, falls back to listing crawl.
- Plus stronger **infinite-scroll / "Load more"** handling for listing pages.

---

## What was added (by area)

**Discovery**
- `scrapers/sitemap-crawler.js` — sitemap discovery (robots.txt + gzip + nested index).
- `services/sitemapExplorer.js` + `/api/sitemap/summary|match` — the visual sitemap step.
- `scrapers/category-crawler.js` — category-link discovery (patterns + nav fallback).
- `scrapers/listing-crawler.js` — strengthened infinite-scroll / load-more + early-stop.

**Change detection**
- `utils/contentHash.js` — content fingerprint.
- `products.content_hash` + `products.synced_hash` columns (added to prod safely).
- `services/changeDetection.js`, `services/refreshJob.js`, `scheduler/refresh-scheduler.js`.
- `/api/changes`, `/changes/refresh`, `/changes/resync`, `/changes/baseline`,
  `/api/refresh-scheduler/*`.

**Scaling**
- `utils/concurrency.js` — concurrency limiter; concurrent scraping in the crawl branches.

**Frontend (Mapping Studio + admin)**
- Discovery-mode chooser as the first step; new **Sitemap step**; new **Changed Products**
  page with the auto-detect settings card.

---

## Verification (latest run)

| Check | Result |
|---|---|
| Backend unit tests (concurrency, content-hash, sitemap, category) | **27/27 pass** |
| Frontend type-check | **pass** |
| Full API route graph imports | **clean** |
| Read-only DB smoke (`/changes`, refresh scheduler) | **pass** |
| Main-site sync push | **not tested (by request)** |

---

## Safe-by-default choices
- The refresh/auto-resync scheduler **starts paused**; auto re-sync is **off** by default.
- Discovery modes are **opt-in per profile** — existing profiles behave exactly as before.
- The production DB column add was **additive only** (no destructive migration).

## Not yet done
- A **live end-to-end run** against real sites with the server running (crawl + detect).
- Firing a real **re-sync to the main site** (held back intentionally).
