-- ============================================================================
-- Product Monitor — MySQL schema
-- ----------------------------------------------------------------------------
-- Ported from the original PostgreSQL spec to MySQL (MySQL 8.0+):
--   * SERIAL            -> INT AUTO_INCREMENT PRIMARY KEY
--   * JSONB             -> LONGTEXT holding JSON (portable across MySQL 5.7/8
--                          and MariaDB 10.1+, which lacks a JSON column type)
--   * TEXT[] arrays     -> LONGTEXT holding a JSON array of strings
--   * NOW()             -> CURRENT_TIMESTAMP
--   * Postgres "\c db"  -> removed (connect via the configured DB_DATABASE)
--   * DECIMAL(10,2)     -> unchanged
--   * Partial / array indexes adapted to standard B-tree indexes
--
-- The database itself (DB_DATABASE, default "greenbidz") is assumed to exist.
-- setup.js runs this file against that database.
-- ============================================================================

-- ── Products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    external_id         VARCHAR(255) NOT NULL,
    -- 191 chars: the max indexable utf8mb4 length on MariaDB 10.1 (767-byte
    -- key limit). Marketplace product URLs are far shorter than this.
    product_url         VARCHAR(191) NOT NULL,
    profile_file_name   VARCHAR(255),
    raw_data            LONGTEXT NOT NULL,
    title               TEXT,
    price               DECIMAL(10, 2),
    description         MEDIUMTEXT,
    images_local_paths  LONGTEXT,       -- JSON array of strings
    images_remote_urls  LONGTEXT,       -- JSON array of strings
    first_seen_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    -- Discovery flag: a product is first inserted as a stub with scraped = FALSE
    -- (it was found in a listing) and flipped to TRUE once fully scraped. This
    -- replaces the old separate seen_products table.
    scraped             BOOLEAN NOT NULL DEFAULT FALSE,
    scraped_at          TIMESTAMP NULL DEFAULT NULL,
    scrape_attempts     INT NOT NULL DEFAULT 0,
    last_error          TEXT,
    UNIQUE KEY uq_products_url (product_url),
    KEY idx_products_profile (profile_file_name),
    KEY idx_products_first_seen (first_seen_at),
    KEY idx_products_active (is_active),
    KEY idx_products_scraped (scraped)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- NOTE: There is no separate seen_products table. The discovery queue and the
-- duplicate-prevention flag live directly on products (the `scraped` column).
-- The ONLY_NEW_PRODUCTS flag (see config/constants.js) decides whether a crawl
-- cycle scrapes only the scraped = FALSE rows (true) or every product (false).

-- ── Crawl history ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_history (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    listing_url             TEXT NOT NULL,
    products_found          INT,
    new_products            INT,
    failed_products         INT,
    crawl_duration_seconds  INT,
    status                  VARCHAR(50),
    error_message           TEXT,
    timestamp               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crawl_history_ts (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Pending mappings (for review) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_mappings (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    url_pattern           VARCHAR(191) NOT NULL,
    sample_url            TEXT NOT NULL,
    auto_detected_fields  LONGTEXT,
    user_approved_fields  LONGTEXT,
    status                VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at           TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_pending_pattern (url_pattern)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- All performance indexes are declared inline within the CREATE TABLE
-- statements above (MySQL has no "CREATE INDEX IF NOT EXISTS"), so re-running
-- this file is idempotent.
