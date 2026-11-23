const crypto = require('node:crypto');
const path = require('node:path');

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DB_PATH:
    process.env.DB_PATH ||
    (process.env.NODE_ENV === 'test'
      ? ':memory:'
      : path.join(__dirname, '..', 'data', 'ecommerce.sqlite')),
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ||
    'aura_atelier_access_secret_key_9f8d7c6b5a4e3f2d1c0b9a8f7e6d5c4b_2026',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ||
    'aura_atelier_refresh_secret_key_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d_2026',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || '7', 10),
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || (process.env.NODE_ENV === 'test' ? '8' : '12'), 10),
  TAX_RATE: parseFloat(process.env.TAX_RATE || '0.14'), // 14% VAT
  FREE_SHIPPING_THRESHOLD: parseFloat(process.env.FREE_SHIPPING_THRESHOLD || '250.00'),
  STANDARD_SHIPPING_FEE: parseFloat(process.env.STANDARD_SHIPPING_FEE || '18.00'),
  UPLOAD_DIR: path.join(__dirname, '..', '..', 'frontend', 'assets', 'uploads'),
  MAX_UPLOAD_SIZE_BYTES: 2 * 1024 * 1024, // 2MB strict limit
};

module.exports = env;
