/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const User = require('../models/User');

const DEFAULT_PASSWORD = process.env.DEFAULT_ALL_DEMO_PASSWORD || 'Demo@123';

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({})
    .select('username role')
    .sort({ username: 1 })
    .lean();

  const rows = users.map((u, index) => ({
    SrNo: index + 1,
    UserId: String(u.username || '').trim(),
    Password: DEFAULT_PASSWORD
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Credentials');

  const outputDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'all_user_credentials_userid_password.xlsx');
  XLSX.writeFile(workbook, outputFile);

  console.log('Cross-check Excel generated successfully.');
  console.log(`Users exported: ${rows.length}`);
  console.log(`File: ${outputFile}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to export cross-check credentials:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
