const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const env = require('./env');

let dbInstance = null;

/**
 * Returns a singleton DatabaseSync instance with Foreign Keys, WAL mode,
 * and busy timeout configured for concurrent transactional safety.
 */
function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (env.DB_PATH !== ':memory:') {
    const dir = path.dirname(env.DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new DatabaseSync(env.DB_PATH);
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  if (env.DB_PATH !== ':memory:') {
    dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  dbInstance.exec('PRAGMA busy_timeout = 5000;');

  return dbInstance;
}

/**
 * Runs DDL schema migration and seeds initial catalog if empty.
 */
function initDatabase({ forceReset = false, skipSeed = false } = {}) {
  const db = getDb();

  if (forceReset) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS refresh_tokens;
      DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS order_items;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS cart_items;
      DROP TABLE IF EXISTS carts;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS users;
      PRAGMA foreign_keys = ON;
    `);
  }

  const schemaPath = path.join(__dirname, '..', 'models', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  if (!skipSeed) {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (!countRow || countRow.count === 0) {
      const { seedDatabase } = require('../utils/seedData');
      seedDatabase(db);
    }
  }

  return db;
}

/**
 * Executes a callback inside an atomic IMMEDIATE transaction.
 * Rolls back automatically on any thrown error.
 */
function withTransaction(fn) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch (_) {
      // ignore rollback error if transaction already closed
    }
    throw err;
  }
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  initDatabase,
  withTransaction,
  closeDatabase,
};
