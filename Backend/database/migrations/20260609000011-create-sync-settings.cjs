'use strict';

// Single-row durable config for the sync scheduler:
// { enabled, intervalHours, targets:[{profile, marketplace, sellerId, sellerName, country, filters}] }
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sync_settings',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        config_json: { type: Sequelize.JSON, allowNull: true },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      { charset: 'utf8mb4' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sync_settings');
  },
};
