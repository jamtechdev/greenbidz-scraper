/**
 * @file models/crawlHistory.js — one row per listing crawl run.
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';

export const CrawlHistory = sequelize.define(
  'CrawlHistory',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    listing_url: { type: DataTypes.TEXT, allowNull: false },
    products_found: { type: DataTypes.INTEGER, allowNull: true },
    new_products: { type: DataTypes.INTEGER, allowNull: true },
    scraped_products: { type: DataTypes.INTEGER, allowNull: true },
    failed_products: { type: DataTypes.INTEGER, allowNull: true },
    crawl_duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(50), allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'crawl_history', timestamps: false },
);

export default CrawlHistory;
