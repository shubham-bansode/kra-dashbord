const mongoose = require('mongoose');
require('dotenv').config();

const KraMonthlyEntry = require('../models/KraMonthlyEntry');

async function main() {
  const confirm = process.argv[2];

  if (confirm !== 'DELETE_KRA_ENTRIES') {
    console.error('❌ Refusing to run. Pass confirmation token:');
    console.error('   node seeds/wipeKraEntries.js DELETE_KRA_ENTRIES');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const result = await KraMonthlyEntry.deleteMany({});
  console.log(`✅ Deleted ${result.deletedCount} KRA entry submissions`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Wipe failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
