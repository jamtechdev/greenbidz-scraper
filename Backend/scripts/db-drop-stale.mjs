// One-off: drop the stale `products` and `crawl_history` tables so `npm run
// setup` can recreate them fresh with the full column set (no ALTER needed).
// DESTRUCTIVE — only run when you do NOT want the existing rows in those tables.
// A short lock_wait_timeout ensures it fails fast instead of hanging if blocked.
// Run:  node scripts/db-drop-stale.mjs
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectTimeout: 8000,
});

try {
  await conn.query('SET SESSION lock_wait_timeout = 10');
  for (const t of ['products', 'crawl_history']) {
    process.stdout.write(`Dropping ${t} ... `);
    await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    console.log('done');
  }
  console.log('\n✅ Dropped. Now run:  npm run setup   (recreates them with all columns)');
} catch (e) {
  console.error('\n❌ Failed:', e.code || '', e.message);
  console.error('If this is "Lock wait timeout", something is still holding the table —');
  console.error('run scripts/db-diagnose.mjs to find and KILL the blocking thread.');
} finally {
  await conn.end();
  process.exit(0);
}
