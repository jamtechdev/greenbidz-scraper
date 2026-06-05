'use strict';

// Track whether a scraped product has been synced to the main GreenBidz site,
// so the UI can mark it and prevent re-syncing.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'synced_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'main_product_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'main_product_id');
    await queryInterface.removeColumn('products', 'synced_at');
  },
};
