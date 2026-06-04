/**
 * @file utils/logger.js
 * @description Colored console logger + persistent error log file.
 *              Writes errors to logs/error.log and mirrors a human-friendly,
 *              emoji-tagged stream to the console (matching the spec's output
 *              format).
 */

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const LOGS_DIR = path.resolve(
  process.cwd(),
  process.env.LOGS_DIR || 'logs',
);
const ERROR_LOG = path.join(LOGS_DIR, 'error.log');
const ACTIVITY_LOG = path.join(LOGS_DIR, 'activity.log');

/** Ensure the logs directory exists (created lazily on first write). */
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/** Build a `[YYYY-MM-DD HH:mm:ss]` timestamp. */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Append a line to a log file, creating the directory if needed. */
function appendFile(file, line) {
  try {
    ensureLogsDir();
    fs.appendFileSync(file, line + '\n', 'utf8');
  } catch {
    // Never let logging crash the app.
  }
}

const DEBUG = /^(true|1|yes)$/i.test(process.env.DEBUG || '');

export const logger = {
  /** Raw line, already formatted (no timestamp prefix added). */
  raw(message) {
    console.log(message);
    appendFile(ACTIVITY_LOG, message);
  },

  /** Informational line with timestamp. */
  info(message) {
    const line = `[${timestamp()}] ${message}`;
    console.log(line);
    appendFile(ACTIVITY_LOG, line);
  },

  /** Success line (green ✅). */
  success(message) {
    const line = `[${timestamp()}] ✅ ${message}`;
    console.log(chalk.green(line));
    appendFile(ACTIVITY_LOG, line);
  },

  /** Warning line (yellow ⚠️). */
  warn(message) {
    const line = `[${timestamp()}] ⚠️  ${message}`;
    console.log(chalk.yellow(line));
    appendFile(ACTIVITY_LOG, line);
  },

  /**
   * Error line (red ❌). Persists to error.log with optional stack/context.
   * @param {string} message
   * @param {object} [meta] - Extra context: { url, error, stack }.
   */
  error(message, meta = {}) {
    const line = `[${timestamp()}] ❌ ${message}`;
    console.error(chalk.red(line));
    const detail = {
      time: timestamp(),
      message,
      ...meta,
    };
    appendFile(ERROR_LOG, JSON.stringify(detail));
    appendFile(ACTIVITY_LOG, line);
  },

  /** Debug line (gray), only when DEBUG env is truthy. */
  debug(message) {
    if (!DEBUG) return;
    const line = `[${timestamp()}] 🐛 ${message}`;
    console.log(chalk.gray(line));
  },

  /** Step line indented under a product (for the per-product output). */
  step(emoji, message) {
    const line = `[${timestamp()}]   ${emoji} ${message}`;
    console.log(line);
    appendFile(ACTIVITY_LOG, line);
  },
};

export default logger;
