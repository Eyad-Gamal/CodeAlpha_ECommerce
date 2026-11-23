const { initDatabase, closeDatabase } = require('./database');

console.log('[AURA // ATELIER] Resetting and seeding relational database...');
initDatabase({ forceReset: true, skipSeed: false });
closeDatabase();
console.log('[AURA // ATELIER] Database seeded successfully.');
