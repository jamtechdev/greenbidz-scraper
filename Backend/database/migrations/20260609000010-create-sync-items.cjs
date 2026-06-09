'use strict';

// Per-product outcome of a sync run: success (got a main product id), failed
// (POST error / no id), or skipped (missing required fields pre-flight).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sync_items',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        sync_run_id: { type: Sequelize.INTEGER, allowNull: false },
        product_id: { type: Sequelize.INTEGER, allowNull: false },
        status: { type: Sequelize.STRING(16), allowNull: false },
        main_product_id: { type: Sequelize.INTEGER, allowNull: true },
        error: { type: Sequelize.TEXT, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      { charset: 'utf8mb4' },
    );
    await queryInterface.addIndex('sync_items', ['sync_run_id']);
    await queryInterface.addIndex('sync_items', ['product_id']);
    await queryInterface.addIndex('sync_items', ['sync_run_id', 'status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sync_items');
  },
};
