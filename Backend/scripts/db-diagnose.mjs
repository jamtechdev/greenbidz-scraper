// Read-only DB diagnostic: shows what's running / blocking, so a hung ALTER or a
// lock-holding session is visible. Safe — it only SELECTs, changes nothing.
// Run:  node scripts/db-diagnose.mjs
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

const [procs] = await conn.query('SHOW FULL PROCESSLIST');
console.log('\n=== PROCESSLIST (non-idle / interesting) ===');
for (const p of procs) {
  // Show anything that isn't a plain idle connection.
  if (p.Command !== 'Sleep' || (p.Info && p.Info.trim())) {
    console.log(
      `id=${p.Id} user=${p.User} cmd=${p.Command} time=${p.Time}s state="${p.State || ''}" info=${(p.Info || '').slice(0, 120)}`,
    );
  }
}

const [trx] = await conn
  .query(
    `SELECT trx_id, trx_state, trx_started, trx_mysql_thread_id AS thread_id,
            TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_s,
            LEFT(trx_query, 120) AS query
     FROM information_schema.innodb_trx ORDER BY trx_started`,
  )
  .catch(() => [[]]);
console.log('\n=== OPEN InnoDB TRANSACTIONS ===');
if (!trx.length) console.log('(none)');
for (const t of trx) {
  console.log(`thread=${t.thread_id} state=${t.trx_state} age=${t.age_s}s query=${t.query || ''}`);
}

console.log('\nTip: a row with state "Waiting for table metadata lock" is BLOCKED;');
console.log('the blocker is another thread (often Sleep with an open trx). KILL it with:  KILL <id>;');
await conn.end();
process.exit(0);
