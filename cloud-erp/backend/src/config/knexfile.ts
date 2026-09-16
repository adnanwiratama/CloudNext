import { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const config: { [key: string]: Knex.Config } = {
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
      directory: path.join(__dirname, '../../database/migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../database/seeds'),
      extension: 'ts',
    },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 20 },
    migrations: {
      directory: path.join(__dirname, '../../database/migrations'),
      extension: 'js',
    },
    seeds: {
      directory: path.join(__dirname, '../../database/seeds'),
      extension: 'js',
    },
  },
};

export default config;
module.exports = config;
