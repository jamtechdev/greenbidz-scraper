// One-off: verify DB connectivity and create the target database.
// Usage: node scripts/db-bootstrap.mjs [dbName]
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const name = process.argv[2] || 'greenbidz_v2';
const useSsl = process.env.DB_SSL !== 'false';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

console.log('Connected to', process.env.DB_HOST);
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const [dbs] = await conn.query('SHOW DATABASES');
console.log('Databases:', dbs.map((r) => Object.values(r)[0]).join(', '));
await conn.end();
console.log('OK — ensured database:', name);
