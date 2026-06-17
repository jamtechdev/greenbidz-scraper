/**
 * @file config/database.js
 * @description MySQL connection pool (mysql2/promise).
 *
 * NOTE: The original spec targeted PostgreSQL, but the deployment database is
 * MySQL (DB_CONNECTION=mysql, port 3306). This module exposes a small, generic
 * surface (`query`, `getConnection`, `transaction`, `testConnection`, `closePool`)
 * so the rest of the app is driver-agnostic.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

/**
 * Lazily-created singleton pool. Created on first use so that scripts which
 * never touch the DB (e.g. profile validation) don't open connections.
 * @type {import('mysql2/promise').Pool | null}
 */
let pool = null;

/** Build the pool configuration from environment variables. */
function buildConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'greenbidz',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Allow running multiple statements from schema.sql in one call.
    multipleStatements: true,
    // Keep big JSON payloads happy.
    charset: 'utf8mb4',
    // mysql2 returns DECIMAL as string by default; keep that (precise money).
    decimalNumbers: false,
  };
}

/**
 * Get the shared connection pool, creating it on first call.
 * @returns {import('mysql2/promise').Pool}
 */
export function getPool() {
  if (!pool) {
    pool = mysql.createPool(buildConfig());
    logger.debug(
      `MySQL pool created for ${process.env.DB_USERNAME}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
    );
  }
  return pool;
}

/**
 * Run a parameterised SQL query.
 * @param {string} sql - SQL with `?` placeholders.
 * @param {Array<*>} [params=[]] - Bound parameters.
 * @returns {Promise<any>} The first element of mysql2's [rows, fields] tuple.
 */
export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/**
 * Run a raw (possibly multi-statement) SQL string without parameter binding.
 * Used by setup.js to execute schema.sql. Uses `query` (not `execute`) because
 * prepared statements don't support multiple statements.
 * @param {string} sql
 * @returns {Promise<any>}
 */
export async function raw(sql) {
  const [result] = await getPool().query(sql);
  return result;
}

/**
 * Acquire a dedicated connection (caller is responsible for releasing it).
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 */
export async function getConnection() {
  return getPool().getConnection();
}

/**
 * Create a brand-new standalone connection (NOT from the pool). Use this for
 * one-off maintenance like DDL after a multi-statement run: a pooled connection
 * that just executed a multipleStatements query can hang on a follow-up
 * prepared statement, so a fresh connection avoids that. Caller must `.end()`.
 * @returns {Promise<import('mysql2/promise').Connection>}
 */
export async function createStandaloneConnection() {
  return mysql.createConnection(buildConfig());
}

/**
 * Run a function inside a transaction, committing on success and rolling back
 * on error.
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function transaction(work) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Verify the database is reachable.
 * @returns {Promise<boolean>} true on success.
 */
export async function testConnection() {
  const conn = await getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

/** Gracefully close the pool (call on shutdown). */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default { getPool, query, raw, getConnection, transaction, testConnection, closePool };
