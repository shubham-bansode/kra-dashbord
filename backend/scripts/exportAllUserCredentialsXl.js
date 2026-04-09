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

const DEFAULT_PASSWORD = process.env.DEFAULT_ALL_DEMO_PASSWORD || 'Demo@123';
const LEVEL_SORT_ORDER = {
  corporation: 1,
  region: 2,
  circle: 3,
  division: 4,
  admin: 5,
  superadmin: 6
};

function safeText(value) {
  return String(value || '').trim();
}

function levelForUser(user) {
  return safeText(user?.hierarchyLevel) || safeText(user?.role) || 'division';
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({})
    .select('username role hierarchyLevel corporation region circle division')
    .populate('corporation', 'name code')
    .populate('region', 'name code')
    .populate('circle', 'name code')
    .populate('division', 'name code')
    .lean();

  const sortedUsers = [...users].sort((a, b) => {
    const corpA = safeText(a?.corporation?.name);
    const corpB = safeText(b?.corporation?.name);
    if (corpA !== corpB) return corpA.localeCompare(corpB);

    const levelA = levelForUser(a);
    const levelB = levelForUser(b);
    const orderA = LEVEL_SORT_ORDER[levelA] || 99;
    const orderB = LEVEL_SORT_ORDER[levelB] || 99;
    if (orderA !== orderB) return orderA - orderB;

    const regionA = safeText(a?.region?.name);
    const regionB = safeText(b?.region?.name);
    if (regionA !== regionB) return regionA.localeCompare(regionB);

    const circleA = safeText(a?.circle?.name);
    const circleB = safeText(b?.circle?.name);
    if (circleA !== circleB) return circleA.localeCompare(circleB);

    const divisionA = safeText(a?.division?.name);
    const divisionB = safeText(b?.division?.name);
    if (divisionA !== divisionB) return divisionA.localeCompare(divisionB);

    return safeText(a?.username).localeCompare(safeText(b?.username));
  });

  const rows = sortedUsers.map((u, index) => ({
    SrNo: index + 1,
    Corporation: safeText(u?.corporation?.name),
    Region: safeText(u?.region?.name),
    Circle: safeText(u?.circle?.name),
    Division: safeText(u?.division?.name),
    Username: safeText(u?.username),
    Password: DEFAULT_PASSWORD
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Credentials');

  const outputDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'all_user_credentials.xlsx');
  XLSX.writeFile(workbook, outputFile);

  console.log('Excel file generated successfully.');
  console.log(`Users exported: ${rows.length}`);
  console.log(`File: ${outputFile}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to export credentials:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
