// sequelize-cli database config (CommonJS). Reads the same DB_* env the app
// uses. Aiven MySQL requires TLS, so SSL is on by default; set DB_SSL=false to
// disable for a local/non-TLS MySQL.
require('dotenv').config();

const useSsl = process.env.DB_SSL !== 'false';

const base = {
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'greenbidz',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  dialectOptions: useSsl ? { ssl: { rejectUnauthorized: false } } : {},
  // snake_case columns everywhere; manage our own timestamp columns.
  define: { underscored: true, freezeTableName: true, timestamps: false },
  logging: false,
};

module.exports = { development: base, test: base, production: base };
