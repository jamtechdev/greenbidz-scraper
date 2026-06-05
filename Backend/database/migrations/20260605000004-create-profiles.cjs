'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'profiles',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        file_name: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        profile_id: { type: Sequelize.STRING(255), allowNull: true },
        profile_name: { type: Sequelize.STRING(255), allowNull: true },
        domain: { type: Sequelize.STRING(191), allowNull: true },
        source: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'dom' },
        scrape_mode: { type: Sequelize.STRING(16), allowNull: true },
        scrape_limit: { type: Sequelize.INTEGER, allowNull: true },
        download_images: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        paused: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        url_pattern: { type: Sequelize.TEXT, allowNull: true },
        config: { type: Sequelize.JSON, allowNull: false },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      { charset: 'utf8mb4' },
    );
    await queryInterface.addIndex('profiles', ['domain']);
    await queryInterface.addIndex('profiles', ['scrape_mode']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('profiles');
  },
};
