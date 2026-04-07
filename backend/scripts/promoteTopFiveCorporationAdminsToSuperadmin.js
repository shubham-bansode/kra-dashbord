/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const Corporation = require('../models/Corporation');
const User = require('../models/User');

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const corporations = await Corporation.find().sort({ name: 1 }).limit(5).lean();
  if (corporations.length < 5) {
    throw new Error(`Expected at least 5 corporations, found ${corporations.length}`);
  }  

  const results = [];

  for (const corp of corporations) {
    const corpName = normalizeName(corp.name);
    const corpCode = normalizeName(corp.code) || corpName;

    const user = await User.findOne({
      corporation: corp._id,
      role: { $in: ['admin', 'superadmin'] }
    }).select('fullName mobileNumber role corporation isActive');

    if (!user) {
      results.push({
        status: 'missing',
        corporation: corpName,
        corporationCode: corpCode,
        message: 'No admin found for corporation'
      });
      continue;
    }

    const previousRole = user.role;
    user.role = 'superadmin';
    user.isActive = true;
    await user.save();

    results.push({
      status: previousRole === 'superadmin' ? 'already-superadmin' : 'promoted',
      corporation: corpName,
      corporationCode: corpCode,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber,
      previousRole,
      currentRole: user.role
    });
  }

  console.log('\n=== Promote Top 5 Corporation Admins To Superadmin ===');
  results.forEach((row, idx) => {
    if (row.status === 'missing') {
      console.log(
        `${idx + 1}. [MISSING] ${row.corporation} (${row.corporationCode}) | ${row.message}`
      );
      return;
    }

    console.log(
      `${idx + 1}. [${row.status.toUpperCase()}] ${row.corporation} (${row.corporationCode}) | ${row.fullName} | ${row.mobileNumber} | ${row.previousRole} -> ${row.currentRole}`
    );
  });

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to promote admins:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
