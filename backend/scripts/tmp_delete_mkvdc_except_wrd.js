/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Corporation = require('../models/Corporation');

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const corp =
    (await Corporation.findOne({ name: /mkvdc.*pune|pune.*mkvdc/i }).lean()) ||
    (await Corporation.findOne({ name: /mkvdc/i }).lean());

  if (!corp) {
    throw new Error('MKVDC corporation not found');
  }

  const users = await User.find({ corporation: corp._id })
    .select('_id fullName username userId role')
    .lean();

  const idsToDelete = users
    .filter((u) => {
      const a = norm(u.userId);
      const b = norm(u.username);
      return a !== 'wrd1' && a !== 'wrd2' && b !== 'wrd1' && b !== 'wrd2';
    })
    .map((u) => u._id);

  const result = await User.deleteMany({ _id: { $in: idsToDelete } });

  const remaining = await User.find({ corporation: corp._id })
    .select('fullName username userId role')
    .lean();

  console.log(
    JSON.stringify(
      {
        corporation: corp.name,
        requestedDelete: idsToDelete.length,
        deletedCount: result.deletedCount,
        remainingCount: remaining.length,
        remaining,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Delete failed:', e.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
