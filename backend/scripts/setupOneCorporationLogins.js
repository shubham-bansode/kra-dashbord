/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');
const User = require('../models/User');

const DEFAULT_PASSWORD = process.env.DEFAULT_CORP_DEMO_PASSWORD || 'Demo@123';
const MOBILE_SEED_START = Number(process.env.DEMO_MOBILE_SEED || 9000000000);

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toUsernameBase(value) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return base || 'user';
}

async function findAvailableUsername(baseName) {
  let idx = 0;
  while (idx < 5000) {
    const candidate = idx === 0 ? baseName : `${baseName}.${idx + 1}`;
    const exists = await User.findOne({ username: candidate }).select('_id').lean();
    if (!exists) return candidate;
    idx += 1;
  }
  throw new Error(`Unable to allocate username for base: ${baseName}`);
}

async function findAvailableMobile(startAt) {
  let current = Number(startAt);
  while (current <= 9999999999) {
    const candidate = String(current);
    if (/^[6-9]\d{9}$/.test(candidate)) {
      const existing = await User.findOne({ mobileNumber: candidate }).select('_id').lean();
      if (!existing) return candidate;
    }
    current += 1;
  }
  throw new Error('Unable to allocate mobile numbers for demo users');
}

async function pickCorporation() {
  const code = normalizeName(process.env.DEMO_CORPORATION_CODE).toUpperCase();
  const name = normalizeName(process.env.DEMO_CORPORATION_NAME);

  if (code) {
    const corp = await Corporation.findOne({ code, isActive: true }).lean();
    if (!corp) throw new Error(`No active corporation found for code: ${code}`);
    return corp;
  }

  if (name) {
    const corp = await Corporation.findOne({ name, isActive: true }).lean();
    if (!corp) throw new Error(`No active corporation found for name: ${name}`);
    return corp;
  }

  // Default selection: active corporation with highest number of divisions.
  const ranked = await Division.aggregate([
    {
      $lookup: {
        from: 'corporations',
        localField: 'corporation',
        foreignField: '_id',
        as: 'corporation'
      }
    },
    { $unwind: '$corporation' },
    { $match: { 'corporation.isActive': true } },
    { $group: { _id: '$corporation._id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 }
  ]);

  if (ranked.length > 0) {
    const corp = await Corporation.findById(ranked[0]._id).lean();
    if (corp) return corp;
  }

  const firstActive = await Corporation.findOne({ isActive: true }).sort({ name: 1 }).lean();
  if (!firstActive) throw new Error('No active corporation found');
  return firstActive;
}

async function createOrGetUser({ corporationId, fullName, role, passwordHash, mobileSeed, cache }) {
  const usernameBase = toUsernameBase(fullName);
  const existingByName = await User.findOne({
    corporation: corporationId,
    fullName,
    role
  })
    .select('fullName username mobileNumber role')
    .lean();

  if (existingByName) {
    return {
      user: existingByName,
      status: 'existing',
      nextSeed: mobileSeed
    };
  }

  let mobileNumber = await findAvailableMobile(mobileSeed);
  while (cache.has(mobileNumber)) {
    mobileNumber = await findAvailableMobile(Number(mobileNumber) + 1);
  }
  cache.add(mobileNumber);

  const username = await findAvailableUsername(usernameBase);

  const created = await User.create({
    corporation: corporationId,
    fullName,
    username,
    mobileNumber,
    passwordHash,
    role,
    isActive: true
  });

  return {
    user: {
      fullName: created.fullName,
      username: created.username,
      mobileNumber: created.mobileNumber,
      role: created.role
    },
    status: 'created',
    nextSeed: Number(mobileNumber) + 1
  };
}

function getOccurrenceName(baseName, counters) {
  const current = (counters.get(baseName) || 0) + 1;
  counters.set(baseName, current);
  if (current === 1) return baseName;
  return `${baseName} #${current}`;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

  await mongoose.connect(process.env.MONGODB_URI);

  const selectedCorp = await pickCorporation();
  const corporationId = selectedCorp._id;

  const [regions, circles, divisions] = await Promise.all([
    Region.find({ corporation: corporationId, isActive: true }).sort({ name: 1 }).lean(),
    Circle.find({ corporation: corporationId, isActive: true }).sort({ name: 1 }).lean(),
    Division.find({ corporation: corporationId, isActive: true }).sort({ name: 1 }).lean()
  ]);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const credentials = [];
  const allocatedMobiles = new Set();
  const nameCounters = new Map();
  let mobileSeed = MOBILE_SEED_START;

  // 1) One corporation admin for managing users/entries.
  const corpAdminName = getOccurrenceName(
    `${normalizeName(selectedCorp.code) || normalizeName(selectedCorp.name)} Corporation Admin`,
    nameCounters
  );
  const corpAdmin = await createOrGetUser({
    corporationId,
    fullName: corpAdminName,
    role: 'admin',
    passwordHash,
    mobileSeed,
    cache: allocatedMobiles
  });
  mobileSeed = corpAdmin.nextSeed;
  credentials.push({ level: 'corporation', status: corpAdmin.status, ...corpAdmin.user });

  // 2) Region-level login users.
  for (const r of regions) {
    const regionName = getOccurrenceName(
      `${normalizeName(r.name)} Region User`,
      nameCounters
    );
    const row = await createOrGetUser({
      corporationId,
      fullName: regionName,
      role: 'user',
      passwordHash,
      mobileSeed,
      cache: allocatedMobiles
    });
    mobileSeed = row.nextSeed;
    credentials.push({ level: 'region', status: row.status, ...row.user });
  }

  // 3) Circle-level login users.
  for (const c of circles) {
    const circleName = getOccurrenceName(
      `${normalizeName(c.name)} Circle User`,
      nameCounters
    );
    const row = await createOrGetUser({
      corporationId,
      fullName: circleName,
      role: 'user',
      passwordHash,
      mobileSeed,
      cache: allocatedMobiles
    });
    mobileSeed = row.nextSeed;
    credentials.push({ level: 'circle', status: row.status, ...row.user });
  }

  // 4) Division-level login users.
  for (const d of divisions) {
    const divisionName = getOccurrenceName(
      `${normalizeName(d.name)} Division User`,
      nameCounters
    );
    const row = await createOrGetUser({
      corporationId,
      fullName: divisionName,
      role: 'user',
      passwordHash,
      mobileSeed,
      cache: allocatedMobiles
    });
    mobileSeed = row.nextSeed;
    credentials.push({ level: 'division', status: row.status, ...row.user });
  }

  const createdCount = credentials.filter((c) => c.status === 'created').length;
  const existingCount = credentials.filter((c) => c.status === 'existing').length;

  console.log('\n=== One Corporation Demo Logins ===');
  console.log(`Corporation: ${selectedCorp.name} (${selectedCorp.code})`);
  console.log(`Password for newly created users: ${DEFAULT_PASSWORD}`);
  console.log(`Total accounts prepared: ${credentials.length} | Created: ${createdCount} | Existing: ${existingCount}`);

  for (const row of credentials) {
    console.log(
      `[${row.status.toUpperCase()}] ${row.level.toUpperCase()} | ${row.fullName} | Username: ${row.username} | Mobile: ${row.mobileNumber} | Role: ${row.role}`
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed to setup one-corporation logins:', err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
