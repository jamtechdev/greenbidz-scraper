-- ============================================================================
-- Migration: merge seen_products into products
-- ----------------------------------------------------------------------------
-- The separate seen_products discovery queue is removed. Its `scraped` flag now
-- lives directly on the products table:
--   * a product is discovered  -> stub row inserted with scraped = FALSE
--   * a product is scraped      -> scraped = TRUE, scraped_at = now
--
-- Safe to run more than once (IF NOT EXISTS; MariaDB 10.0.2+/MySQL 8.0.29+).
-- ============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS scraped BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP NULL DEFAULT NULL AFTER scraped;

-- Index for "WHERE scraped = FALSE" selection.
-- (MariaDB 10.1 has no CREATE INDEX IF NOT EXISTS; ignore a duplicate-key error
--  if re-applied.)
ALTER TABLE products
  ADD INDEX idx_products_scraped (scraped);

-- Backfill: any product that already has a title was effectively scraped.
UPDATE products SET scraped = TRUE, scraped_at = COALESCE(scraped_at, last_seen_at)
WHERE title IS NOT NULL AND title <> '';

-- Drop the obsolete discovery-queue table.
DROP TABLE IF EXISTS seen_products;
