/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Corporation = require('../models/Corporation');
const User = require('../models/User');

const DEFAULT_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toUsernameBase(value) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return base || 'admin.user';
}

async function findAvailableUsername(base) {
  let idx = 0;
  while (idx < 5000) {
    const candidate = idx === 0 ? base : `${base}.${idx + 1}`;
    const exists = await User.findOne({ username: candidate }).select('_id').lean();
    if (!exists) return candidate;
    idx += 1;
  }
  throw new Error(`Unable to allocate unique username for: ${base}`);
}

async function findAvailableMobile(start = 9000000000) {
  let candidate = start;
  // keep in valid Indian mobile range [6-9]\d{9}
  while (candidate <= 9999999999) {
    const mobile = String(candidate);
    // Ensure starts with 9 and 10 digits.
    if (/^[6-9]\d{9}$/.test(mobile)) {
      const exists = await User.findOne({ mobileNumber: mobile }).select('_id').lean();
      if (!exists) return mobile;
    }
    candidate += 1;
  }
  throw new Error('Unable to allocate unique mobile numbers for admin users');
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

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const createdOrExisting = [];
  let mobileSeed = 9000000000;

  for (const corp of corporations) {
    const corpName = normalizeName(corp.name);
    const corpCode = normalizeName(corp.code) || corpName;

    let adminUser = await User.findOne({ corporation: corp._id, role: 'admin' })
      .select('fullName username mobileNumber role corporation')
      .lean();

    if (adminUser) {
      createdOrExisting.push({
        status: 'existing',
        corporation: corpName,
        corporationCode: corpCode,
        fullName: adminUser.fullName,
        username: adminUser.username,
        mobileNumber: adminUser.mobileNumber,
        password: '(unchanged)'
      });
      continue;
    }

    const mobileNumber = await findAvailableMobile(mobileSeed);
    mobileSeed = Number(mobileNumber) + 1;

    const fullName = `${corpCode} Admin`;
    const username = await findAvailableUsername(toUsernameBase(`${corpCode}.admin`));

    const user = await User.create({
      corporation: corp._id,
      fullName,
      username,
      mobileNumber,
      passwordHash,
      role: 'admin',
      isActive: true
    });

    createdOrExisting.push({
      status: 'created',
      corporation: corpName,
      corporationCode: corpCode,
      fullName: user.fullName,
      username: user.username,
      mobileNumber: user.mobileNumber,
      password: DEFAULT_PASSWORD
    });
  }

  console.log('\\n=== Corporation Admin Accounts (Top 5 Corporations) ===');
  createdOrExisting.forEach((row, idx) => {
    console.log(
      `${idx + 1}. [${row.status.toUpperCase()}] ${row.corporation} (${row.corporationCode}) | ${row.fullName} | Username: ${row.username} | Mobile: ${row.mobileNumber} | Password: ${row.password}`
    );
  });

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to create corporation admins:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
