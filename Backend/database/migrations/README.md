# Migrations

Future, incremental schema changes live here as timestamped SQL files, e.g.:

```
migrations/
├── 20250101_000000_add_currency_column.sql
└── 20250215_000000_add_seller_table.sql
```

## Conventions

- **Filename:** `YYYYMMDD_HHMMSS_short_description.sql`
- **Forward-only:** each file applies one change and is safe to run once.
- **Idempotent where possible:** prefer `CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS` (MySQL 8.0.29+), or guard with information_schema
  checks so re-runs don't error.

## Applying migrations

The initial schema is applied by `npm run setup` (which runs
`database/schema.sql`). To apply a migration manually:

```bash
mysql -h <host> -u <user> -p <database> < database/migrations/<file>.sql
```

A lightweight migration runner can be added later; for now migrations are
applied manually in filename order.
