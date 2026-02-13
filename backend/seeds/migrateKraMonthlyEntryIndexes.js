/**
 * Migrates KraMonthlyEntry unique index to include `division`.
 *
 * Run when upgrading an existing database that already has the old unique index
 * (corporation + region + circle + achievementMonth + achievementYear).
 *
 * Usage:
 *   node seeds/migrateKraMonthlyEntryIndexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const KraMonthlyEntry = require('../models/KraMonthlyEntry');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  const collection = mongoose.connection.collection('kramonthlyentries');
  const indexes = await collection.indexes();

  // Find the old unique index that does NOT include division.
  const oldIndex = indexes.find((idx) => {
    const keys = idx.key || {};
    const keyNames = Object.keys(keys);
    const isOldKeySet =
      keyNames.length === 5 &&
      keyNames.includes('corporation') &&
      keyNames.includes('region') &&
      keyNames.includes('circle') &&
      keyNames.includes('achievementMonth') &&
      keyNames.includes('achievementYear');

    return isOldKeySet && idx.unique === true;
  });

  if (oldIndex) {
    console.log('🗑️  Dropping old unique index:', oldIndex.name);
    await collection.dropIndex(oldIndex.name);
    console.log('   ✓ Dropped');
  } else {
    console.log('ℹ️  Old unique index not found (or already migrated).');
  }

  console.log('🔁 Syncing indexes from Mongoose schema...');
  const result = await KraMonthlyEntry.syncIndexes();
  console.log('✅ syncIndexes result:', result);

  await mongoose.disconnect();
  console.log('✅ Done');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
