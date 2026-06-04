-- ============================================================================
-- Migration: add discovery-queue columns to seen_products
-- ----------------------------------------------------------------------------
-- Adds the `scraped` flag (+ external_id, scraped_at) so a crawl can record
-- every discovered product and then scrape only the not-yet-scraped ones,
-- gated by the ONLY_NEW_PRODUCTS config boolean.
--
-- Safe to run more than once (uses IF NOT EXISTS, supported by MariaDB 10.0.2+
-- and MySQL 8.0.29+). On older MySQL, drop the "IF NOT EXISTS" clauses.
-- ============================================================================

ALTER TABLE seen_products
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) NULL AFTER product_url;

ALTER TABLE seen_products
  ADD COLUMN IF NOT EXISTS scraped BOOLEAN NOT NULL DEFAULT FALSE AFTER external_id;

ALTER TABLE seen_products
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP NULL DEFAULT NULL AFTER last_seen;

-- Index to make "WHERE scraped = FALSE" fast.
-- (MariaDB 10.1 lacks "CREATE INDEX IF NOT EXISTS"; ignore a duplicate-key error
--  if this migration is re-applied.)
ALTER TABLE seen_products
  ADD INDEX idx_seen_scraped (scraped);
