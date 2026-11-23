const app = require('./app');
const env = require('./config/env');
const { initDatabase, closeDatabase } = require('./config/database');

initDatabase();

const server = app.listen(env.PORT, () => {
  console.log(`\n==================================================================`);
  console.log(`  AURA // ATELIER — CodeAlpha E-Commerce Store is LIVE`);
  console.log(`  Storefront & Admin UI : http://localhost:${env.PORT}`);
  console.log(`  REST API Base URL     : http://localhost:${env.PORT}/api/v1`);
  console.log(`  Environment           : ${env.NODE_ENV}`);
  console.log(`==================================================================\n`);
});

function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down server gracefully...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
