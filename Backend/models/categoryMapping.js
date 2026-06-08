/**
 * @file models/categoryMapping.js — source category → main-site category map.
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const CategoryMapping = sequelize.define(
  'CategoryMapping',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    site_type: { type: DataTypes.STRING(32), allowNull: false },
    source_category: { type: DataTypes.STRING(255), allowNull: false },
    source_subcategory: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    main_term_id: { type: DataTypes.INTEGER, allowNull: false },
    main_term_name: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'category_mappings', timestamps: false },
);

export default CategoryMapping;
