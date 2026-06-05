'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'crawl_history',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        listing_url: { type: Sequelize.TEXT, allowNull: false },
        products_found: { type: Sequelize.INTEGER, allowNull: true },
        new_products: { type: Sequelize.INTEGER, allowNull: true },
        failed_products: { type: Sequelize.INTEGER, allowNull: true },
        crawl_duration_seconds: { type: Sequelize.INTEGER, allowNull: true },
        status: { type: Sequelize.STRING(50), allowNull: true },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        timestamp: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      { charset: 'utf8mb4' },
    );
    await queryInterface.addIndex('crawl_history', ['timestamp']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('crawl_history');
  },
};
