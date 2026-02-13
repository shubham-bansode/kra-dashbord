/**
 * Import Regions/Circles/Divisions for exactly ONE corporation.
 *
 * Constraint: do not mix corporation data.
 *
 * Usage:
 *   node seeds/importHierarchyOneCorp.js <excelPath> <sheetName> [expectedCorporationNameInSheet] [targetCorporationNameInDb]
 *
 * Examples:
 *   node seeds/importHierarchyOneCorp.js "..\\XL\\Post user ID data_16.4.24_Technical .xlsx" MKVDC
 *   node seeds/importHierarchyOneCorp.js "..\\XL\\Post user ID data_16.4.24_Technical .xlsx" KIDC "Executive Director, Konkan Irrigation Development Corporation - Thane (M Corp.)" "KIDC, Thane"
 */

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');

function generateCode(name) {
  if (!name) return 'UNK';
  const words = String(name)
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 1) return words[0].substring(0, 10).toUpperCase();
  return words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 10);
}

function normalizeCell(value) {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  return v;
}

function shortHash(input) {
  return crypto.createHash('sha1').update(String(input ?? '')).digest('hex').substring(0, 6).toUpperCase();
}

async function ensureUniqueDivisionCode(circleId, divisionName) {
  const normalizedName = normalizeCell(divisionName);
  const base = generateCode(normalizedName);

  // First try the simple generated code.
  let candidate = base;
  const existing = await Division.findOne({ circle: circleId, code: candidate })
    .select('name code')
    .lean();

  if (!existing || normalizeCell(existing.name) === normalizedName) return candidate;

  // Collision: same circle + code but different division name.
  // Make a deterministic, compact variant.
  candidate = `${base}-${shortHash(normalizedName)}`;

  // Extremely unlikely, but just in case: fall back to numeric suffix.
  let attempts = 0;
  while (attempts < 50) {
    const exists = await Division.findOne({ circle: circleId, code: candidate })
      .select('_id')
      .lean();
    if (!exists) return candidate;
    attempts++;
    candidate = `${base}-${shortHash(normalizedName)}-${attempts}`;
  }

  throw new Error(`Could not generate unique Division code for circle=${circleId} name=${normalizedName}`);
}

function findHeaderRowIndex(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i] || [];
    const joined = row.map((c) => String(c || '').toLowerCase()).join(' | ');
    const hasCircle = joined.includes('circle');
    const hasDivision = joined.includes('division');
    const hasRegion = joined.includes('region');
    const hasCorp = joined.includes('corporation');
    if (hasCircle && hasDivision && hasRegion && hasCorp) return i;
  }
  return -1;
}

function pickColumn(headers, regex) {
  const idx = headers.findIndex((h) => regex.test(String(h || '')));
  if (idx >= 0) return headers[idx];
  return null;
}

async function upsertByUnique(Model, query, createDoc, setDoc) {
  const setOnInsert = { ...(createDoc || {}) };
  const set = { ...(setDoc || {}) };

  // MongoDB does not allow the same path in both $setOnInsert and $set.
  for (const key of Object.keys(setOnInsert)) {
    if (Object.prototype.hasOwnProperty.call(set, key)) {
      delete set[key];
    }
  }

  const update = { $setOnInsert: setOnInsert };
  if (Object.keys(set).length > 0) update.$set = set;

  const doc = await Model.findOneAndUpdate(query, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  });
  return doc;
}

async function main() {
  const excelPathArg = process.argv[2];
  const sheetName = process.argv[3];
  const expectedCorpNameInSheetArg = process.argv[4];
  const targetCorpNameInDbArg = process.argv[5];

  if (!excelPathArg || !sheetName) {
    console.log(
      'Usage: node seeds/importHierarchyOneCorp.js <excelPath> <sheetName> [expectedCorporationNameInSheet] [targetCorporationNameInDb]'
    );
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  const excelPath = path.resolve(process.cwd(), excelPathArg);

  console.log('📖 Reading Excel:', excelPath);
  const workbook = XLSX.readFile(excelPath, { cellDates: true });

  if (!workbook.SheetNames.includes(sheetName)) {
    console.error('❌ Sheet not found:', sheetName);
    console.log('Available sheets:', workbook.SheetNames);
    process.exit(1);
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) {
    console.error('❌ Could not find a header row containing Circle/Division/Region/Corporation columns.');
    process.exit(1);
  }

  const headersRaw = matrix[headerRowIndex] || [];
  const headers = headersRaw.map((h) => normalizeCell(h));

  const corpCol = pickColumn(headers, /corporation/i);
  const regionCol = pickColumn(headers, /region/i);
  const circleCol = pickColumn(headers, /circle/i);
  const divisionCol = pickColumn(headers, /division/i);

  if (!corpCol || !regionCol || !circleCol || !divisionCol) {
    console.error('❌ Missing required columns. Found:', { corpCol, regionCol, circleCol, divisionCol });
    console.error('Headers:', headers);
    process.exit(1);
  }

  // Build row objects
  const dataRows = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = row[c];
    }

    // Keep only if it has at least one of our fields
    const corp = normalizeCell(obj[corpCol]);
    const region = normalizeCell(obj[regionCol]);
    const circle = normalizeCell(obj[circleCol]);
    const division = normalizeCell(obj[divisionCol]);

    if (!corp && !region && !circle && !division) continue;

    dataRows.push({ corp, region, circle, division });
  }

  const corpValues = [...new Set(dataRows.map((r) => r.corp).filter(Boolean))];
  if (expectedCorpNameInSheetArg) {
    const expected = normalizeCell(expectedCorpNameInSheetArg);
    const mismatched = corpValues.filter((c) => c !== expected);
    if (mismatched.length > 0) {
      console.error('❌ This sheet contains corporation values that do not match the expected corporation.');
      console.error('Expected:', expected);
      console.error('Found:', corpValues);
      process.exit(1);
    }
  }

  if (corpValues.length !== 1) {
    console.error('❌ Corporation mixing detected (or missing corporation values).');
    console.error('Unique corporation values in this sheet:', corpValues);
    console.error('Provide [expectedCorporationName] or use a sheet/file that contains exactly one corporation.');
    process.exit(1);
  }

  const sheetCorporationName = expectedCorpNameInSheetArg
    ? normalizeCell(expectedCorpNameInSheetArg)
    : corpValues[0];

  const corporationName = targetCorpNameInDbArg
    ? normalizeCell(targetCorpNameInDbArg)
    : sheetCorporationName;

  if (targetCorpNameInDbArg) {
    console.log('🏷️  Sheet corporation name:', sheetCorporationName);
    console.log('🎯 Target DB corporation name:', corporationName);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  // Upsert corporation
  const corporationDoc = await upsertByUnique(
    Corporation,
    { name: corporationName },
    {
      name: corporationName,
      code: generateCode(corporationName),
      hasRegions: true,
      isActive: true
    },
    { hasRegions: true, isActive: true }
  );

  console.log('🏢 Corporation:', corporationDoc.name);

  const regionCache = new Map(); // regionName -> doc
  const circleCache = new Map(); // regionId||circleName -> doc

  let skipped = 0;
  let regionTouched = 0;
  let circleTouched = 0;
  let divisionTouched = 0;

  const expectedDivisionKeys = new Set(); // circleId||divisionName
  const touchedCircleIds = new Set();

  for (const row of dataRows) {
    const regionName = normalizeCell(row.region);
    const circleName = normalizeCell(row.circle);
    const divisionName = normalizeCell(row.division);

    if (!regionName || !circleName || !divisionName) {
      skipped++;
      continue;
    }

    // Region
    let regionDoc = regionCache.get(regionName);
    if (!regionDoc) {
      regionDoc = await upsertByUnique(
        Region,
        { name: regionName, corporation: corporationDoc._id },
        {
          name: regionName,
          code: generateCode(regionName),
          corporation: corporationDoc._id,
          isActive: true
        },
        { isActive: true }
      );
      regionCache.set(regionName, regionDoc);
      regionTouched++;
    }

    // Circle
    const circleKey = `${String(regionDoc._id)}||${circleName}`;
    let circleDoc = circleCache.get(circleKey);
    if (!circleDoc) {
      circleDoc = await upsertByUnique(
        Circle,
        { name: circleName, region: regionDoc._id },
        {
          name: circleName,
          code: generateCode(circleName),
          region: regionDoc._id,
          corporation: corporationDoc._id,
          isActive: true
        },
        { corporation: corporationDoc._id, isActive: true }
      );
      circleCache.set(circleKey, circleDoc);
      circleTouched++;
    }

    touchedCircleIds.add(String(circleDoc._id));

    // Division
    const divisionKey = `${String(circleDoc._id)}||${divisionName}`;
    expectedDivisionKeys.add(divisionKey);

    const divisionCode = await ensureUniqueDivisionCode(circleDoc._id, divisionName);

    await upsertByUnique(
      Division,
      { name: divisionName, circle: circleDoc._id },
      {
        name: divisionName,
        code: divisionCode,
        circle: circleDoc._id,
        region: regionDoc._id,
        corporation: corporationDoc._id,
        isActive: true
      },
      { region: regionDoc._id, corporation: corporationDoc._id, isActive: true }
    );
    divisionTouched++;
  }

  console.log('\n📦 Import summary');
  console.log('  Rows read:', dataRows.length);
  console.log('  Rows skipped (missing region/circle/division):', skipped);
  console.log('  Regions upserted:', regionTouched);
  console.log('  Circles upserted:', circleTouched);
  console.log('  Divisions upserted:', divisionTouched);

  // Validation: ensure every expected division exists
  const circleIds = [...touchedCircleIds].map((id) => new mongoose.Types.ObjectId(id));
  const dbDivisions = await Division.find({ corporation: corporationDoc._id, circle: { $in: circleIds } })
    .select('name circle')
    .lean();

  const dbKeys = new Set(dbDivisions.map((d) => `${String(d.circle)}||${normalizeCell(d.name)}`));
  const missing = [];
  for (const key of expectedDivisionKeys) {
    if (!dbKeys.has(key)) missing.push(key);
  }

  if (missing.length > 0) {
    console.error('\n❌ Validation failed: some divisions are missing in DB.');
    console.error('Missing count:', missing.length);
    console.error('First 20 missing keys (circleId||divisionName):', missing.slice(0, 20));
    process.exitCode = 2;
  } else {
    console.log('\n✅ Validation OK: all divisions for this corporation sheet exist in DB.');
    console.log('Expected divisions:', expectedDivisionKeys.size);
    console.log('DB divisions found for touched circles:', dbDivisions.length);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
