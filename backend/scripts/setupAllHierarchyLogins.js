/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');
const User = require('../models/User');

const DEMO_PASSWORD = process.env.DEFAULT_ALL_DEMO_PASSWORD || 'Demo@123';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanCode(value) {
  return normalizeText(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function titleToken(value) {
  const s = normalizeText(value)
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'HQ';
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
    .join('');
}

function placeFromName(name, fallback = 'HQ') {
  const n = normalizeText(name);
  if (!n) return fallback;

  const byComma = n.split(',').map((x) => normalizeText(x)).filter(Boolean);
  if (byComma.length > 1) return titleToken(byComma[byComma.length - 1]);

  const byDash = n.split(/\s[-–—]\s/).map((x) => normalizeText(x)).filter(Boolean);
  if (byDash.length > 1) return titleToken(byDash[byDash.length - 1]);

  const words = n.split(/\s+/).filter(Boolean);
  return titleToken(words[words.length - 1] || fallback);
}

function acronymFromDivisionName(name) {
  const words = normalizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const skip = new Set(['executive', 'exective', 'engineer', 'of', 'and', 'the']);
  const mapped = {
    development: 'D',
    irrigation: 'I',
    irregation: 'I',
    division: 'D',
    project: 'P',
    canal: 'C',
    no: ''
  };

  let out = 'EE';
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (skip.has(w)) continue;
    if (/^\d+$/.test(w)) {
      out += w;
      continue;
    }
    out += mapped[w] !== undefined ? mapped[w] : w.charAt(0).toUpperCase();
  }
  return out;
}

function preferredCorpUsername(corp) {
  const code = cleanCode(corp?.code || corp?.name || 'CORP');
  const place = titleToken(corp?.location || placeFromName(corp?.name, 'HQ'));
  return `ED${code}_${place}`;
}

function preferredRegionUsername(region) {
  const code = cleanCode(region?.code || region?.name || 'REG');
  const place = placeFromName(region?.name, 'HQ');
  return `${code}_${place}`;
}

function preferredCircleUsername(circle) {
  const code = cleanCode(circle?.code || circle?.name || 'CIR');
  const place = placeFromName(circle?.name, 'HQ');
  return `SE${code}_${place}`;
}

function preferredDivisionUsername(division) {
  const code = cleanCode(division?.code || '');
  const place = placeFromName(division?.name, 'HQ');
  const core = code || acronymFromDivisionName(division?.name || 'Division');
  return `${core}_${place}`;
}

async function reserveUniqueUsername(preferred, used) {
  const base = normalizeText(preferred).toLowerCase();
  let idx = 0;
  while (idx < 5000) {
    const candidate = idx === 0 ? base : `${base}.${idx + 1}`;
    if (used.has(candidate)) {
      idx += 1;
      continue;
    }

    const exists = await User.findOne({ username: candidate }).select('_id').lean();
    if (!exists) {
      used.add(candidate);
      return candidate;
    }
    idx += 1;
  }
  throw new Error(`Unable to reserve username for base: ${preferred}`);
}

function buildAdminTargets(corporations) {
  const mkvdcPune = corporations.find((c) => {
    const name = normalizeText(c?.name).toLowerCase();
    return name.includes('mkvdc') && name.includes('pune');
  });

  const assignedCorp = mkvdcPune || corporations[0];
  if (!assignedCorp) return [];

  return [
    {
      level: 'admin',
      sourceId: 'WRD1',
      fullName: 'WRD Admin 1',
      preferredUsername: 'WRD1',
      role: 'admin',
      corporation: assignedCorp._id,
      region: null,
      circle: null,
      division: null,
      hierarchyLevel: 'admin'
    },
    {
      level: 'superadmin',
      sourceId: 'WRD2',
      fullName: 'WRD Super Admin 2',
      preferredUsername: 'WRD2',
      role: 'superadmin',
      corporation: assignedCorp._id,
      region: null,
      circle: null,
      division: null,
      hierarchyLevel: 'superadmin'
    }
  ];
}

async function upsertUserTarget(target, passwordHash, usedUsernames) {
  const preferredLower = normalizeText(target.preferredUsername).toLowerCase();
  const existing = await User.findOne({ username: preferredLower });

  if (existing) {
    existing.fullName = target.fullName;
    existing.corporation = target.corporation;
    existing.region = target.region || null;
    existing.circle = target.circle || null;
    existing.division = target.division || null;
    existing.hierarchyLevel = target.hierarchyLevel || target.level;
    existing.role = target.role;
    existing.isActive = true;
    existing.passwordHash = passwordHash;
    if (target.mobileNumber) existing.mobileNumber = target.mobileNumber;
    await existing.save();
    usedUsernames.add(existing.username);
    return {
      status: 'updated',
      username: existing.username,
      role: existing.role,
      level: target.level,
      fullName: existing.fullName
    };
  }

  const username = await reserveUniqueUsername(target.preferredUsername, usedUsernames);
  const createDoc = {
    corporation: target.corporation,
    region: target.region || null,
    circle: target.circle || null,
    division: target.division || null,
    hierarchyLevel: target.hierarchyLevel || target.level,
    fullName: target.fullName,
    username,
    passwordHash,
    role: target.role,
    isActive: true
  };
  if (target.mobileNumber) createDoc.mobileNumber = target.mobileNumber;

  const created = await User.create(createDoc);

  return {
    status: 'created',
    username: created.username,
    role: created.role,
    level: target.level,
    fullName: created.fullName
  };
}

async function ensureMobileNumberIndexCompatibility() {
  // Normalize empty/legacy values so unique sparse index behaves correctly.
  await User.updateMany(
    {
      $or: [
        { mobileNumber: null },
        { mobileNumber: '' },
        { mobileNumber: { $exists: false } }
      ]
    },
    { $unset: { mobileNumber: 1 } }
  );

  const indexes = await User.collection.indexes();
  const mobileIndex = indexes.find((idx) => idx.name === 'mobileNumber_1');

  if (mobileIndex && mobileIndex.unique && !mobileIndex.sparse) {
    await User.collection.dropIndex('mobileNumber_1');
    await User.collection.createIndex(
      { mobileNumber: 1 },
      {
        name: 'mobileNumber_1',
        unique: true,
        sparse: true
      }
    );
  }
}

async function enforceCanonicalUsername(canonicalUsername, findFilter) {
  const canonical = normalizeText(canonicalUsername).toLowerCase();
  const already = await User.findOne({ username: canonical }).select('_id').lean();
  if (already) return;

  const candidate = await User.findOne(findFilter).sort({ createdAt: 1 });
  if (!candidate) return;

  candidate.username = canonical;
  await candidate.save();
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await ensureMobileNumberIndexCompatibility();

  const [corporations, regions, circles, divisions] = await Promise.all([
    Corporation.find({ isActive: true }).sort({ name: 1 }).lean(),
    Region.find({ isActive: true }).sort({ name: 1 }).lean(),
    Circle.find({ isActive: true }).sort({ name: 1 }).lean(),
    Division.find({ isActive: true }).sort({ name: 1 }).lean()
  ]);

  if (corporations.length === 0) {
    throw new Error('No active corporations found');
  }

  const targets = [];

  // All hierarchy users as role=user
  for (const c of corporations) {
    targets.push({
      level: 'corporation',
      sourceId: String(c._id),
      fullName: `${normalizeText(c.name)} Corporation User`,
      preferredUsername: preferredCorpUsername(c),
      role: 'user',
      corporation: c._id,
      region: null,
      circle: null,
      division: null,
      hierarchyLevel: 'corporation'
    });
  }

  for (const r of regions) {
    targets.push({
      level: 'region',
      sourceId: String(r._id),
      fullName: `${normalizeText(r.name)} Region User`,
      preferredUsername: preferredRegionUsername(r),
      role: 'user',
      corporation: r.corporation,
      region: r._id,
      circle: null,
      division: null,
      hierarchyLevel: 'region'
    });
  }

  for (const c of circles) {
    targets.push({
      level: 'circle',
      sourceId: String(c._id),
      fullName: `${normalizeText(c.name)} Circle User`,
      preferredUsername: preferredCircleUsername(c),
      role: 'user',
      corporation: c.corporation,
      region: c.region,
      circle: c._id,
      division: null,
      hierarchyLevel: 'circle'
    });
  }

  for (const d of divisions) {
    targets.push({
      level: 'division',
      sourceId: String(d._id),
      fullName: `${normalizeText(d.name)} Division User`,
      preferredUsername: preferredDivisionUsername(d),
      role: 'user',
      corporation: d.corporation,
      region: d.region,
      circle: d.circle,
      division: d._id,
      hierarchyLevel: 'division'
    });
  }

  // Add WRD1 and WRD2 with privileged roles.
  targets.push(...buildAdminTargets(corporations));

  const usedUsernames = new Set();
  const results = [];
  for (const t of targets) {
    // Ensure mkvdc examples exactly if records exist.
    if (t.level === 'corporation' && /mkvdc/i.test(t.fullName) && /pune/i.test(t.fullName)) {
      t.preferredUsername = 'EDMKVDC_Pune';
    }
    if (t.level === 'region' && /ce\s*sp/i.test(t.fullName) && /pune/i.test(t.fullName)) {
      t.preferredUsername = 'CESP_Pune';
    }
    if (t.level === 'circle' && /bcc/i.test(t.fullName) && /solapur/i.test(t.fullName)) {
      t.preferredUsername = 'SEBCC_Solapur';
    }
    if (t.level === 'division' && /(bhima|bheima)/i.test(t.fullName) && /development/i.test(t.fullName) && /no\.?\s*2/i.test(t.fullName) && /solapur/i.test(t.fullName)) {
      t.preferredUsername = 'EEBDD2_Solapur';
    }

    const row = await upsertUserTarget(t, passwordHash, usedUsernames);
    results.push(row);
  }

  const summary = results.reduce((acc, row) => {
    acc.total += 1;
    acc[row.status] = (acc[row.status] || 0) + 1;
    acc[row.level] = (acc[row.level] || 0) + 1;
    return acc;
  }, { total: 0 });

  await enforceCanonicalUsername('EDMKVDC_Pune', {
    role: 'user',
    fullName: /(?=.*mkvdc)(?=.*pune)/i,
    username: /edmkvdc/i
  });
  await enforceCanonicalUsername('CESP_Pune', {
    role: 'user',
    fullName: /(?=.*ce\s*sp)(?=.*pune)/i
  });
  await enforceCanonicalUsername('SEBCC_Solapur', {
    role: 'user',
    fullName: /(?=.*bcc)(?=.*solapur)/i
  });
  await enforceCanonicalUsername('EEBDD2_Solapur', {
    role: 'user',
    fullName: /(?=.*bhima)(?=.*development)(?=.*no\.?\s*2)(?=.*solapur)/i
  });

  console.log('\n=== All Hierarchy Login Provisioning ===');
  console.log(`Password for all accounts: ${DEMO_PASSWORD}`);
  console.log(`Total: ${summary.total} | Created: ${summary.created || 0} | Updated: ${summary.updated || 0}`);
  console.log(`By level => corporation: ${summary.corporation || 0}, region: ${summary.region || 0}, circle: ${summary.circle || 0}, division: ${summary.division || 0}, admin: ${summary.admin || 0}, superadmin: ${summary.superadmin || 0}`);

  const examples = results
    .filter((r) => ['admin', 'superadmin', 'corporation', 'region', 'circle', 'division'].includes(r.level))
    .slice(0, 25);

  console.log('\n--- Sample Login IDs ---');
  examples.forEach((r, i) => {
    console.log(`${i + 1}. [${r.level}] ${r.fullName} => ${r.username} (${r.role})`);
  });

  const wrd1 = results.find((r) => r.username === 'wrd1');
  const wrd2 = results.find((r) => r.username === 'wrd2');
  if (wrd1 || wrd2) {
    console.log('\n--- Admin Accounts ---');
    if (wrd1) console.log(`WRD1 => ${wrd1.username} (${wrd1.role})`);
    if (wrd2) console.log(`WRD2 => ${wrd2.username} (${wrd2.role})`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to setup all hierarchy logins:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
