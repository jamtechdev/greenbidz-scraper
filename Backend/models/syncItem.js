/**
 * @file models/syncItem.js — per-product outcome within a sync run.
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const SyncItem = sequelize.define(
  'SyncItem',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sync_run_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false }, // success | failed | skipped
    main_product_id: { type: DataTypes.INTEGER, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'sync_items', timestamps: false },
);

export default SyncItem;
