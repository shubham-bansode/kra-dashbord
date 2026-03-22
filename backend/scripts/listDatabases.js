#!/usr/bin/env node
/**
 * List all databases on a MongoDB Atlas cluster.
 * Usage: node scripts/listDatabases.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const URI = process.env.MONGODB_URI || process.argv[2];
if (!URI) { console.error('No URI'); process.exit(1); }

async function main() {
  const conn = await mongoose.createConnection(URI).asPromise();
  const admin = conn.db.admin();
  const { databases } = await admin.listDatabases();
  console.log('\nDatabases on this cluster:\n');
  for (const db of databases) {
    console.log(`  ${db.name.padEnd(30)} ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log('');
  await conn.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
