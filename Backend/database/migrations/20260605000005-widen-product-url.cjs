'use strict';

// labassets (and similar) product URLs include long descriptive slugs that
// exceed VARCHAR(191). Widen to 512 chars — still within InnoDB's 3072-byte
// unique-index limit for utf8mb4 (512 * 4 = 2048 bytes). MODIFY COLUMN keeps
// the existing unique index on product_url.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('products', 'product_url', {
      type: Sequelize.STRING(512),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('products', 'product_url', {
      type: Sequelize.STRING(191),
      allowNull: false,
    });
  },
};
