/**
 * @file models/syncSettings.js — single-row durable config for the sync scheduler.
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const SyncSettings = sequelize.define(
  'SyncSettings',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    config_json: { type: DataTypes.JSON, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'sync_settings', timestamps: false },
);

export default SyncSettings;
