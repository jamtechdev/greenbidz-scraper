/**
 * @file config/sequelize.js
 * @description Singleton Sequelize instance (ESM) used by the app's models and
 *              repositories. Mirrors db/config.cjs (used by sequelize-cli) so
 *              the runtime and migrations share one connection definition.
 *
 * Aiven MySQL requires TLS — SSL is on by default; set DB_SSL=false for a
 * local non-TLS MySQL.
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const useSsl = process.env.DB_SSL !== 'false';

export const sequelize = new Sequelize(
  process.env.DB_DATABASE || 'greenbidz',
  process.env.DB_USERNAME || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    dialectOptions: useSsl ? { ssl: { rejectUnauthorized: false } } : {},
    define: { underscored: true, freezeTableName: true, timestamps: false },
    pool: { max: 10, min: 0, idle: 10000 },
    logging: false,
  },
);

/** Verify the database is reachable. Throws on failure. */
export async function testSequelize() {
  await sequelize.authenticate();
  logger.debug('Sequelize authenticated.');
  return true;
}

export default sequelize;
