'use strict';

// A sync run = one bulk submission of products to the main site (manual,
// scheduled, or a resync of failures). Run-level status + counts; per-product
// outcomes live in sync_items. Mirrors the crawl_history persistence pattern.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sync_runs',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // In-memory job id (web/jobs.js) for live polling; ephemeral on restart.
        job_id: { type: Sequelize.STRING(64), allowNull: true },
        site_type: { type: Sequelize.STRING(32), allowNull: false },
        profile: { type: Sequelize.STRING(255), allowNull: true },
        seller_id: { type: Sequelize.INTEGER, allowNull: false },
        seller_name: { type: Sequelize.STRING(255), allowNull: true },
        country: { type: Sequelize.STRING(128), allowNull: true },
        filters_json: { type: Sequelize.JSON, allowNull: true },
        trigger: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'manual' },
        total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        success_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        failed_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'processing' },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        duration_seconds: { type: Sequelize.INTEGER, allowNull: true },
      },
      { charset: 'utf8mb4' },
    );
    await queryInterface.addIndex('sync_runs', ['created_at']);
    await queryInterface.addIndex('sync_runs', ['status']);
    await queryInterface.addIndex('sync_runs', ['profile']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sync_runs');
  },
};
