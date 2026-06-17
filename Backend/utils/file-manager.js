/**
 * @file utils/file-manager.js
 * @description JSON profile file operations: list, read, write, exists, and
 *              directory creation. All profile I/O goes through here so paths
 *              and JSON formatting stay consistent.
 */

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { literal } from 'sequelize';
import { CONSTANTS } from '../config/constants.js';
import { Profile } from '../models/index.js';

/**
 * Ensure a directory exists (recursive). Synchronous because it's used in
 * setup paths and is cheap.
 * @param {string} dir
 */
export function ensureDirSync(dir) {
  if (!fssync.existsSync(dir)) {
    fssync.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure a directory exists (async).
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * List all profile JSON filenames in the profiles directory.
 * @returns {Promise<string[]>} Filenames (e.g. ["profile_101lab.json"]).
 */
export async function listProfileFiles() {
  await ensureDir(CONSTANTS.PROFILES_DIR);
  const entries = await fs.readdir(CONSTANTS.PROFILES_DIR);
  return entries.filter(
    (f) => f.endsWith('.json') && f !== 'template.json',
  );
}

/**
 * Map a profile object to the `profiles` table columns. `file_name` stays the
 * stable identity key the rest of the app uses; the full object is kept in the
 * `config` JSON column (single source of truth), with key fields mirrored into
 * queryable columns.
 * @param {string} fileName
 * @param {object} profile
 */
function profileColumns(fileName, profile) {
  return {
    file_name: fileName,
    profile_id: profile.profileId ?? null,
    profile_name: profile.profileName ?? null,
    domain: profile.domain ?? null,
    source: profile.source || 'dom',
    scrape_mode: profile.scrapeMode ?? null,
    scrape_limit: profile.scrapeLimit ?? null,
    download_images: !!profile.downloadImages,
    paused: !!profile.paused,
    url_pattern: profile.urlPattern ?? null,
    config: profile,
  };
}

/**
 * Coerce a stored `config` into an object. The column is LONGTEXT holding JSON,
 * and `raw: true` reads bypass Sequelize's DataTypes.JSON parsing — so MySQL
 * hands the value back as a STRING. Parse it here (defensively: already-object
 * values, e.g. a native JSON column, pass straight through).
 * @param {string|object} config
 * @returns {object}
 */
function parseConfig(config) {
  if (config && typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config || {};
}

/**
 * Read a profile by its file_name key from the database.
 * @param {string} fileName - e.g. "profile_101lab.json".
 * @returns {Promise<object>} The stored profile object.
 */
export async function readProfile(fileName) {
  const row = await Profile.findOne({ where: { file_name: fileName }, raw: true });
  if (!row) throw new Error(`Profile not found: ${fileName}`);
  return parseConfig(row.config);
}

/**
 * Read every profile, returning { fileName, profile } pairs.
 * @returns {Promise<Array<{ fileName: string, profile: object }>>}
 */
export async function readAllProfiles() {
  const rows = await Profile.findAll({ order: [['file_name', 'ASC']], raw: true });
  return rows.map((r) => ({ fileName: r.file_name, profile: parseConfig(r.config) }));
}

/**
 * Insert or update a profile (upsert on file_name).
 * @param {string} fileName
 * @param {object} profile
 * @returns {Promise<string>} The file_name key written.
 */
export async function writeProfile(fileName, profile) {
  await Profile.upsert({
    ...profileColumns(fileName, profile),
    updated_at: literal('CURRENT_TIMESTAMP'),
  });
  return fileName;
}

/**
 * Check whether a profile exists (async — now DB-backed).
 * @param {string} fileName
 * @returns {Promise<boolean>}
 */
export async function profileExists(fileName) {
  const n = await Profile.count({ where: { file_name: fileName } });
  return n > 0;
}

/**
 * Delete a profile. Resolves quietly if it's already gone.
 * @param {string} fileName
 * @returns {Promise<void>}
 */
export async function deleteProfile(fileName) {
  await Profile.destroy({ where: { file_name: fileName } });
}

/**
 * Read a text file relative to project root.
 * @param {string} relativePath
 * @returns {Promise<string>}
 */
export async function readTextFile(relativePath) {
  const full = path.resolve(CONSTANTS.PROFILES_DIR, '..', relativePath);
  return fs.readFile(full, 'utf8');
}

export default {
  ensureDir,
  ensureDirSync,
  listProfileFiles,
  readProfile,
  readAllProfiles,
  writeProfile,
  profileExists,
  deleteProfile,
  readTextFile,
};
