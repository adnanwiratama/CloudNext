// CommonJS knexfile for CLI usage
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cloud_erp',
      user: process.env.DB_USER || 'erp_user',
      password: process.env.DB_PASSWORD || 'erp_secure_password',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './database/migrations',
      extension: 'js',
    },
    seeds: {
      directory: './database/seeds',
      extension: 'js',
    },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cloud_erp',
      user: process.env.DB_USER || 'erp_user',
      password: process.env.DB_PASSWORD || 'erp_secure_password',
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: './database/migrations-js',
      extension: 'js',
    },
    seeds: {
      directory: './database/seeds-js',
      extension: 'js',
    },
  },
};
