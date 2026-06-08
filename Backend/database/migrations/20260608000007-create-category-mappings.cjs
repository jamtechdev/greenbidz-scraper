'use strict';

// Persistent mapping of a source site's scraped category → a main-site category,
// keyed by (site_type, source_category, source_subcategory). Mapped once per
// site, then reused so sync auto-selects categories deterministically.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'category_mappings',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        site_type: { type: Sequelize.STRING(32), allowNull: false },
        source_category: { type: Sequelize.STRING(255), allowNull: false },
        // '' (not NULL) so the unique key treats "no subcategory" consistently.
        source_subcategory: { type: Sequelize.STRING(255), allowNull: false, defaultValue: '' },
        main_term_id: { type: Sequelize.INTEGER, allowNull: false },
        main_term_name: { type: Sequelize.STRING(255), allowNull: true },
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
    await queryInterface.addIndex('category_mappings', ['site_type', 'source_category', 'source_subcategory'], {
      unique: true,
      name: 'uq_category_mappings_key',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('category_mappings');
  },
};
