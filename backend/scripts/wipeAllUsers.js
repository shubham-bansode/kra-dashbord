/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const confirm = process.argv[2];

  if (confirm !== 'DELETE_ALL_USERS') {
    console.error('Refusing to run. Pass confirmation token:');
    console.error('node scripts/wipeAllUsers.js DELETE_ALL_USERS');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const result = await User.deleteMany({});
  console.log(`Deleted ${result.deletedCount} users`);

  const remaining = await User.countDocuments({});
  console.log(`Remaining users: ${remaining}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to wipe users:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
