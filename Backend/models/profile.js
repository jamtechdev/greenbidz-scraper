/**
 * @file models/profile.js — scraping profiles (migrated from JSON files).
 *
 * Hybrid storage: queryable columns (domain, source, scrape_mode, …) plus a
 * `config` JSON column holding the FULL profile object (listingUrls, fields,
 * selectors, pagination, api block, …). `file_name` stays the stable identity
 * key the rest of the app already uses, so nothing downstream has to change.
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const Profile = sequelize.define(
  'Profile',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    file_name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    profile_id: { type: DataTypes.STRING(255), allowNull: true },
    profile_name: { type: DataTypes.STRING(255), allowNull: true },
    domain: { type: DataTypes.STRING(191), allowNull: true },
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'dom' },
    scrape_mode: { type: DataTypes.STRING(16), allowNull: true },
    scrape_limit: { type: DataTypes.INTEGER, allowNull: true },
    download_images: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    paused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    url_pattern: { type: DataTypes.TEXT, allowNull: true },
    config: { type: DataTypes.JSON, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'profiles', timestamps: false },
);

export default Profile;
