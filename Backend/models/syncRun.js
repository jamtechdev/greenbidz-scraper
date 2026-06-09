/**
 * @file models/syncRun.js — one bulk sync submission (run-level status/counts).
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const SyncRun = sequelize.define(
  'SyncRun',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    job_id: { type: DataTypes.STRING(64), allowNull: true },
    site_type: { type: DataTypes.STRING(32), allowNull: false },
    profile: { type: DataTypes.STRING(255), allowNull: true },
    seller_id: { type: DataTypes.INTEGER, allowNull: false },
    seller_name: { type: DataTypes.STRING(255), allowNull: true },
    country: { type: DataTypes.STRING(128), allowNull: true },
    filters_json: { type: DataTypes.JSON, allowNull: true },
    trigger: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'manual' },
    total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    success_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'processing' },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'sync_runs', timestamps: false },
);

export default SyncRun;
