/**
 * One-time migration for EXACTLY ONE corporation to make Google Form hierarchy authoritative.
 *
 * Fixes:
 * - Divisions are attached to long-form Circle/Region documents.
 * - Frontend now shows only Google-Form exact Circle names.
 * - Result: Division dropdown becomes empty.
 *
 * What this script does (for one corporation):
 * 1) Ensures all Google-Form Regions/Circles exist in DB (creates missing ones).
 * 2) Finds long-form circles that currently hold divisions.
 * 3) Moves those divisions to the matching Google-Form circle.
 * 4) Best-effort updates KRA monthly entries to reference the Google-Form circle.
 *
 * IMPORTANT:
 * - Processes ONE corporation at a time (per your rules).
 * - Does NOT rename any Google Form values.
 *
 * Usage:
 *   node seeds/migrateHierarchyToGoogleFormOneCorp.js "VIDC, Nagpur"
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');
const KraMonthlyEntry = require('../models/KraMonthlyEntry');

const { GOOGLE_FORM_HIERARCHY } = require('../config/googleFormHierarchy');

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTextLoose(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

function normalizeKey(value) {
  return normalizeTextLoose(value).toUpperCase();
}

function normalizePlaceAliases(placeUpper) {
  // Only map OLD -> NEW spellings/names.
  // (Does not rename any Google-Form values; used only for matching during migration.)
  return String(placeUpper || '')
    .replace(/\bBULDANA\b/g, 'BULDHANA')
    .replace(/\bAHMADNAGAR\b/g, 'AHILYANAGAR')
    .replace(/\bAURANGABAD\b/g, 'CHH SAMBHAJINAGAR')
    .replace(/\bOSMANABAD\b/g, 'DHARASHIV');
}

function generateCode(name) {
  if (!name) return 'UNK';
  const words = String(name)
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 1) return words[0].substring(0, 10).toUpperCase();
  return words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 10);
}

async function ensureUniqueCode(Model, scopeQuery, codeBase) {
  const base = String(codeBase || 'CODE').toUpperCase().substring(0, 10) || 'CODE';
  let candidate = base;
  let attempts = 0;
  while (attempts < 50) {
    const exists = await Model.findOne({ ...scopeQuery, code: candidate }).select('_id').lean();
    if (!exists) return candidate;
    attempts++;
    candidate = `${base.substring(0, 8)}${attempts}`;
  }
  return `${base.substring(0, 7)}X`;
}

function splitKey(key) {
  const s = String(key || '');
  const idx = s.indexOf('|');
  if (idx < 0) return { abbr: s, place: '' };
  return { abbr: s.slice(0, idx), place: s.slice(idx + 1) };
}

// Google-Form circle key:
// - Prefer comma split: "ABC, Place" => "ABC|PLACE"
// - Fallback: space split: "GLIC Ambadi" => "GLIC|AMBADI"
function googleFormCircleKey(circleName) {
  const name = normalizeText(circleName);
  if (!name) return null;

  const commaParts = name.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const abbr = normalizeKey(commaParts[0]);
    const place = normalizePlaceAliases(normalizeKey(commaParts.slice(1).join(', ')));
    if (!abbr || !place) return null;
    return `${abbr}|${place}`;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const abbr = normalizeKey(parts[0]);
    const place = normalizePlaceAliases(normalizeKey(parts.slice(1).join(' ')));
    if (!abbr || !place) return null;
    return `${abbr}|${place}`;
  }

  return null;
}

function acronymFromWords(phrase) {
  const cleaned = normalizeText(phrase).replace(/[^A-Za-z\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((w) => w[0]).join('').toUpperCase();
}

// Long circle name -> key
// Typical: "Superintending Engineer, Foo Bar Circle - Place" => "FB C|PLACE" (based on acronym)
function longCircleKey(circleName) {
  const name = normalizeText(circleName);
  if (!name) return null;
  if (!name.includes('-')) return null;

  const afterComma = name.includes(',') ? name.split(',').slice(1).join(',').trim() : name;
  const noParen = afterComma.replace(/\([^)]*\)/g, '').trim();

  const dashParts = noParen.split('-');
  const left = normalizeText(dashParts[0]);
  const right = normalizeText(dashParts.slice(1).join('-'));
  if (!left || !right) return null;

  const place = normalizePlaceAliases(normalizeKey(right));
  const abbr = normalizeKey(acronymFromWords(left));
  if (!abbr || !place) return null;

  return `${abbr}|${place}`;
}

function findTargetCircleWithFallback(targetMap, key) {
  const direct = targetMap.get(key);
  if (direct) return direct;

  const { abbr, place } = splitKey(key);
  if (!abbr || !place) return null;

  const placeNorm = normalizeKey(place);
  const candidates = [];
  for (const [k, doc] of targetMap.entries()) {
    const parts = splitKey(k);
    if (parts.abbr !== abbr) continue;
    const candidatePlace = normalizeKey(parts.place);
    if (
      candidatePlace &&
      (placeNorm.includes(candidatePlace) || candidatePlace.includes(placeNorm))
    ) {
      candidates.push({ doc, len: candidatePlace.length });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.len - a.len);
  return candidates[0].doc;
}

function findTargetCircleOverride({ corporationName, longCircleName, targetByName }) {
  if (corporationName !== 'GMIDC, Ch. Sambhaji Nagar') return null;

  const name = normalizeText(longCircleName).toUpperCase();

  // GMIDC legacy hierarchy uses different abbreviations than Google-Form circles.
  // These two are known remaining sources that should map by place.
  if (name.includes('AURANGABAD IRRIGATION CIRCLE')) {
    return targetByName.get('CIC, Chh Sambhajinagar') || null;
  }
  if (name.includes('OSMANABAD IRRIGATION CIRCLE')) {
    return targetByName.get('DIC, Dharashiv') || null;
  }

  return null;
}

async function updateEntriesBestEffort({ corpId, fromCircleId, toCircleDoc }) {
  const entries = await KraMonthlyEntry.find({ corporation: corpId, circle: fromCircleId })
    .select('_id corporation region circle division achievementMonth achievementYear')
    .lean();

  let updated = 0;
  let skipped = 0;

  for (const e of entries) {
    const exists = await KraMonthlyEntry.findOne({
      corporation: e.corporation,
      region: toCircleDoc.region,
      circle: toCircleDoc._id,
      division: e.division || null,
      achievementMonth: e.achievementMonth,
      achievementYear: e.achievementYear
    })
      .select('_id')
      .lean();

    if (exists) {
      skipped++;
      continue;
    }

    await KraMonthlyEntry.updateOne(
      { _id: e._id },
      { $set: { region: toCircleDoc.region, circle: toCircleDoc._id } }
    );
    updated++;
  }

  return { updated, skipped };
}

async function main() {
  const corporationName = normalizeText(process.argv[2]);
  if (!corporationName) {
    console.error('Usage: node seeds/migrateHierarchyToGoogleFormOneCorp.js "VIDC, Nagpur"');
    process.exit(1);
  }

  if (!GOOGLE_FORM_HIERARCHY[corporationName]) {
    console.error('❌ Corporation not found in Google Form hierarchy config:', corporationName);
    console.error('Available:', Object.keys(GOOGLE_FORM_HIERARCHY));
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const corp = await Corporation.findOne({ name: corporationName }).lean();
  if (!corp) {
    console.error('❌ Corporation not found in DB:', corporationName);
    process.exit(1);
  }

  const regionsConfig = GOOGLE_FORM_HIERARCHY[corporationName].regions || {};
  const allowedRegionNames = Object.keys(regionsConfig);

  // 1) Ensure Google-Form Regions exist
  const regionByName = new Map();
  for (const regionName of allowedRegionNames) {
    let region = await Region.findOne({ corporation: corp._id, name: regionName }).lean();
    if (!region) {
      const codeBase = generateCode(regionName);
      const code = await ensureUniqueCode(Region, { corporation: corp._id }, codeBase);
      region = await Region.create({ name: regionName, code, corporation: corp._id, isActive: true });
      console.log('➕ Created missing Google-Form region:', regionName);
    }
    regionByName.set(regionName, region);
  }

  // 2) Ensure Google-Form Circles exist
  const allowedCircleNames = new Set();
  for (const [regionName, circles] of Object.entries(regionsConfig)) {
    const region = regionByName.get(regionName);
    for (const circleName of circles) {
      allowedCircleNames.add(circleName);

      let circle = await Circle.findOne({ corporation: corp._id, region: region._id, name: circleName }).lean();
      if (!circle) {
        const codeBase = generateCode(circleName);
        const code = await ensureUniqueCode(Circle, { region: region._id }, codeBase);
        circle = await Circle.create({ name: circleName, code, region: region._id, corporation: corp._id, isActive: true });
        console.log('➕ Created missing Google-Form circle:', circleName, 'under region:', regionName);
      }
    }
  }

  // Build target circle key map
  const targetCircles = await Circle.find({ corporation: corp._id, isActive: true, name: { $in: [...allowedCircleNames] } })
    .select('_id name region')
    .lean();

  const targetByKey = new Map();
  const targetByName = new Map();
  for (const c of targetCircles) {
    targetByName.set(c.name, c);
    const key = googleFormCircleKey(c.name);
    if (!key) continue;
    // Keep first; keys should be unique in practice
    if (!targetByKey.has(key)) targetByKey.set(key, c);
  }

  // 3) Find circles with divisions that are NOT Google-Form circles
  const circles = await Circle.find({ corporation: corp._id, isActive: true })
    .select('_id name region')
    .lean();

  const longCirclesWithDivs = [];
  for (const c of circles) {
    if (allowedCircleNames.has(c.name)) continue;
    const divCount = await Division.countDocuments({ circle: c._id, isActive: true });
    if (divCount > 0) longCirclesWithDivs.push({ ...c, divCount });
  }

  let movedDivisions = 0;
  let migratedCircles = 0;
  let skippedCircles = 0;
  let updatedEntries = 0;
  let skippedEntries = 0;

  for (const longCircle of longCirclesWithDivs) {
    const key = longCircleKey(longCircle.name);
    if (!key) {
      skippedCircles++;
      continue;
    }

    const target =
      findTargetCircleWithFallback(targetByKey, key) ||
      findTargetCircleOverride({
        corporationName,
        longCircleName: longCircle.name,
        targetByName
      });
    if (!target) {
      skippedCircles++;
      continue;
    }

    const divRes = await Division.updateMany(
      { circle: longCircle._id, isActive: true },
      { $set: { circle: target._id, region: target.region, corporation: corp._id } }
    );
    movedDivisions += divRes.modifiedCount || 0;
    migratedCircles++;

    const entryRes = await updateEntriesBestEffort({ corpId: corp._id, fromCircleId: longCircle._id, toCircleDoc: target });
    updatedEntries += entryRes.updated;
    skippedEntries += entryRes.skipped;
  }

  console.log(`✅ Migration complete for ${corporationName}`);
  console.log('Long circles migrated:', migratedCircles);
  console.log('Divisions moved:', movedDivisions);
  console.log('Entries updated:', updatedEntries);
  console.log('Entries skipped (conflict):', skippedEntries);
  console.log('Circles skipped (no match):', skippedCircles);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
