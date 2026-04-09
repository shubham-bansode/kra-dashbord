/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

require('../models/Corporation');
require('../models/Region');
require('../models/Circle');
require('../models/Division');
const User = require('../models/User');

function text(v) {
  return String(v || '').trim();
}

function normalize(v) {
  return text(v).toLowerCase();
}

function getRow(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return text(row[key]);
    }
  }
  return '';
}

function userKey(user) {
  return [
    normalize(user?.corporation?.name),
    normalize(user?.region?.name),
    normalize(user?.circle?.name),
    normalize(user?.division?.name)
  ].join('|');
}

function rowKey(row) {
  return [
    normalize(getRow(row, ['Corporation', 'corporation'])),
    normalize(getRow(row, ['Region', 'region'])),
    normalize(getRow(row, ['Circle', 'circle'])),
    normalize(getRow(row, ['Division', 'division']))
  ].join('|');
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  const sourceFile = process.env.SOURCE_CREDENTIALS_XL
    ? path.resolve(process.env.SOURCE_CREDENTIALS_XL)
    : path.resolve(__dirname, '..', '..', 'all_user_credentials.xlsx');

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Source file not found: ${sourceFile}`);
  }

  const workbook = XLSX.readFile(sourceFile);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Excel has no rows');
  }

  const desiredUsernames = rows
    .map((r) => normalize(getRow(r, ['Username', 'username', 'UserId', 'userId'])))
    .filter(Boolean);

  const duplicates = desiredUsernames.filter((v, i, arr) => arr.indexOf(v) !== i);
  if (duplicates.length > 0) {
    const distinct = [...new Set(duplicates)].slice(0, 10).join(', ');
    throw new Error(`Duplicate usernames in excel: ${distinct}`);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({})
    .populate('corporation', 'name')
    .populate('region', 'name')
    .populate('circle', 'name')
    .populate('division', 'name');

  const byHierarchy = new Map();
  users.forEach((u) => {
    const key = userKey(u);
    if (!byHierarchy.has(key)) byHierarchy.set(key, []);
    byHierarchy.get(key).push(u);
  });

  let updated = 0;
  let unchanged = 0;
  let unresolved = 0;

  for (const row of rows) {
    const desired = normalize(getRow(row, ['Username', 'username', 'UserId', 'userId']));
    if (!desired) continue;

    let targetUser = null;

    if (desired === 'wrd1' || desired === 'wrd2') {
      targetUser = users.find((u) => normalize(u.username) === desired)
        || users.find((u) => normalize(u.fullName).includes(desired));
    }

    if (!targetUser) {
      const key = rowKey(row);
      const candidates = byHierarchy.get(key) || [];

      if (candidates.length === 1) {
        targetUser = candidates[0];
      } else if (candidates.length > 1) {
        const roleUser = candidates.find((u) => u.role === 'user' && normalize(u.hierarchyLevel) === 'corporation');
        targetUser = roleUser || candidates.find((u) => u.role === 'user') || candidates[0];
      }
    }

    if (!targetUser) {
      unresolved += 1;
      continue;
    }

    if (normalize(targetUser.username) === desired) {
      unchanged += 1;
      continue;
    }

    const conflict = await User.findOne({ username: desired }).select('_id').lean();
    if (conflict && String(conflict._id) !== String(targetUser._id)) {
      unresolved += 1;
      continue;
    }

    targetUser.username = desired;
    await targetUser.save();
    updated += 1;
  }

  console.log('Username sync completed');
  console.log(`Source file: ${sourceFile}`);
  console.log(`Rows in excel: ${rows.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Unresolved: ${unresolved}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to sync usernames:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
