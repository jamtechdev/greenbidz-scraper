'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'pending_mappings',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        url_pattern: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        sample_url: { type: Sequelize.TEXT, allowNull: false },
        auto_detected_fields: { type: Sequelize.JSON, allowNull: true },
        user_approved_fields: { type: Sequelize.JSON, allowNull: true },
        status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'pending' },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
      },
      { charset: 'utf8mb4' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pending_mappings');
  },
};
