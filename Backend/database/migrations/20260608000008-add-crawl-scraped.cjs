'use strict';

// Record how many products were actually scraped in a crawl run (distinct from
// products_found / new_products), so the profile detail can show it per crawl.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('crawl_history', 'scraped_products', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('crawl_history', 'scraped_products');
  },
};
