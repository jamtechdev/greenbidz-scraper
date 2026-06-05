'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'products',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        external_id: { type: Sequelize.STRING(255), allowNull: false },
        product_url: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        profile_file_name: { type: Sequelize.STRING(255), allowNull: true },
        raw_data: { type: Sequelize.JSON, allowNull: false },
        title: { type: Sequelize.TEXT, allowNull: true },
        price: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
        description: { type: Sequelize.TEXT('medium'), allowNull: true },
        images_local_paths: { type: Sequelize.JSON, allowNull: true },
        images_remote_urls: { type: Sequelize.JSON, allowNull: true },
        first_seen_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        last_seen_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        scraped: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        scraped_at: { type: Sequelize.DATE, allowNull: true },
        scrape_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        last_error: { type: Sequelize.TEXT, allowNull: true },
      },
      { charset: 'utf8mb4' },
    );
    await queryInterface.addIndex('products', ['profile_file_name']);
    await queryInterface.addIndex('products', ['first_seen_at']);
    await queryInterface.addIndex('products', ['is_active']);
    await queryInterface.addIndex('products', ['scraped']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('products');
  },
};
