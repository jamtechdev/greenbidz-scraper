/**
 * @file models/index.js — central export for the Sequelize instance and all
 * models. Import models from here so the single connection is shared.
 */
import { sequelize } from '../config/sequelize.js';
import { Product } from './product.js';
import { CrawlHistory } from './crawlHistory.js';
import { PendingMapping } from './pendingMapping.js';
import { Profile } from './profile.js';

// No cross-table associations: products reference a profile loosely by
// profile_file_name (string), mirroring the prior schema.

export { sequelize, Product, CrawlHistory, PendingMapping, Profile };

export default { sequelize, Product, CrawlHistory, PendingMapping, Profile };
