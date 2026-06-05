/**
 * @file models/pendingMapping.js — URL patterns awaiting a profile.
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const PendingMapping = sequelize.define(
  'PendingMapping',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    url_pattern: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    sample_url: { type: DataTypes.TEXT, allowNull: false },
    auto_detected_fields: { type: DataTypes.JSON, allowNull: true },
    user_approved_fields: { type: DataTypes.JSON, allowNull: true },
    status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'pending' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'pending_mappings', timestamps: false },
);

export default PendingMapping;
