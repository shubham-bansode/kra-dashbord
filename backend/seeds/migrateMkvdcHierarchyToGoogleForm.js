/**
 * One-time migration for MKVDC, Pune to make Google Form hierarchy authoritative.
 *
 * Problem this fixes:
 * - DB contains long-form Regions/Circles that have Divisions.
 * - UI now shows only Google-Form short names, so those Circles had 0 divisions.
 *
 * This script moves Division (and existing KRA entry) references from long-form
 * Circle/Region documents to the Google-Form Circle/Region documents.
 *
 * IMPORTANT:
 * - Processes ONLY corporation: "MKVDC, Pune".
 * - Does not rename Google Form values.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');
const KraMonthlyEntry = require('../models/KraMonthlyEntry');

const { getAllowedRegionNames, getAllowedCircleNames } = require('../config/googleFormHierarchy');

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

async function ensureUniqueCircleCode(regionId, codeBase) {
  let candidate = String(codeBase || 'CIR').toUpperCase().substring(0, 10) || 'CIR';
  let attempts = 0;
  while (attempts < 50) {
    const exists = await Circle.findOne({ region: regionId, code: candidate }).select('_id').lean();
    if (!exists) return candidate;
    attempts++;
    candidate = `${String(codeBase || 'CIR').toUpperCase().substring(0, 8)}${attempts}`;
  }
  return `${String(codeBase || 'CIR').toUpperCase().substring(0, 7)}X`;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value).toUpperCase();
}

function parseShortRegionKey(regionName) {
  const name = normalizeText(regionName);
  if (!name) return null;
  if (name.includes('-')) return null;
  if (/chief\s+engineer/i.test(name)) return null;

  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const left = normalizeKey(parts[0]);
  const place = normalizeKey(parts.slice(1).join(', '));
  if (!left || !place) return null;
  return `${left}|${place}`;
}

function regionLongToShortKey(regionName) {
  const name = normalizeText(regionName);
  if (!name) return null;
  if (!/chief\s+engineer/i.test(name) || !name.includes('-')) return null;

  const noParen = name.replace(/\([^)]*\)/g, '').trim();
  const dashParts = noParen.split('-');
  const place = normalizeKey(normalizeText(dashParts.slice(1).join('-')));
  if (!place) return null;

  const lower = noParen.toLowerCase();
  let mid = null;
  if (lower.includes('special projects') || lower.includes(' sp')) mid = 'SP';
  else if (lower.includes('water resources department') || lower.includes('wrd')) mid = 'WRD';
  if (!mid) return null;

  const left = normalizeKey(`CE ${mid}`);
  return `${left}|${place}`;
}

function parseShortCircleKey(circleName) {
  const name = normalizeText(circleName);
  if (!name) return null;

  if (name.includes('-')) return null;
  if (/superintending\s+engineer|chief\s+engineer|executive\s+engineer/i.test(name)) {
    return null;
  }

  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const abbr = normalizeKey(parts[0]);
  const place = normalizeKey(parts.slice(1).join(', '));
  if (!abbr || !place) return null;

  return `${abbr}|${place}`;
}

function acronymFromWords(phrase) {
  const cleaned = normalizeText(phrase).replace(/[^A-Za-z\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((w) => w[0]).join('').toUpperCase();
}

function circleLongToShortKey(circleName) {
  const name = normalizeText(circleName);
  if (!name) return null;
  if (!name.includes('-')) return null;

  const afterComma = name.includes(',') ? name.split(',').slice(1).join(',').trim() : name;
  const noParen = afterComma.replace(/\([^)]*\)/g, '').trim();

  const dashParts = noParen.split('-');
  const left = normalizeText(dashParts[0]);
  const right = normalizeText(dashParts.slice(1).join('-'));
  if (!left || !right) return null;

  const place = normalizeKey(right);
  const abbr = normalizeKey(acronymFromWords(left));
  if (!abbr || !place) return null;

  return `${abbr}|${place}`;
}

function splitKey(key) {
  const s = String(key || '');
  const idx = s.indexOf('|');
  if (idx < 0) return { abbr: s, place: '' };
  return { abbr: s.slice(0, idx), place: s.slice(idx + 1) };
}

function findTargetCircleWithFallback(targetCircleMap, circleKey) {
  const direct = targetCircleMap.get(circleKey);
  if (direct) return direct;

  // Deterministic fallback for cases where long-form place has extra words.
  // Example: long key "SIC|SANGLI MIRAJ KUPWAD" should match "SIC|SANGLI".
  const { abbr, place } = splitKey(circleKey);
  if (!abbr || !place) return null;
  const placeNorm = normalizeKey(place);

  const candidates = [];
  for (const [k, doc] of targetCircleMap.entries()) {
    const parts = splitKey(k);
    if (parts.abbr !== abbr) continue;
    const candidatePlace = normalizeKey(parts.place);
    if (candidatePlace && placeNorm.includes(candidatePlace)) {
      candidates.push({ k, doc, candidatePlaceLen: candidatePlace.length });
    }
  }
  if (candidates.length === 0) return null;

  // Pick the most specific match (longest candidate place contained in long place)
  candidates.sort((a, b) => b.candidatePlaceLen - a.candidatePlaceLen);
  return candidates[0].doc;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const corporationName = 'MKVDC, Pune';
  const corp = await Corporation.findOne({ name: corporationName }).lean();
  if (!corp) {
    console.error(`❌ Corporation not found: ${corporationName}`);
    process.exit(1);
  }

  const allowedRegionNames = getAllowedRegionNames(corporationName);
  if (allowedRegionNames.length === 0) {
    console.error('❌ No allowed MKVDC regions found in googleFormHierarchy.js');
    process.exit(1);
  }

  // Build target Google-Form Region map: shortKey -> regionDoc
  const targetRegions = await Region.find({ corporation: corp._id, isActive: true, name: { $in: allowedRegionNames } })
    .select('_id name')
    .lean();

  const targetRegionByKey = new Map();
  for (const r of targetRegions) {
    const key = parseShortRegionKey(r.name);
    if (key) targetRegionByKey.set(key, r);
  }

  // Build target Google-Form Circle maps per target region: circleKey -> circleDoc
  const targetCircleByRegionId = new Map();
  for (const r of targetRegions) {
    const allowedCircles = getAllowedCircleNames(corporationName, r.name);
    // Ensure every allowed circle exists. Create missing ones with a unique code.
    for (const circleName of allowedCircles) {
      const existing = await Circle.findOne({ corporation: corp._id, region: r._id, name: circleName }).select('_id').lean();
      if (existing) continue;

      const codeBase = generateCode(circleName);
      const code = await ensureUniqueCircleCode(r._id, codeBase);
      await Circle.create({
        name: circleName,
        code,
        region: r._id,
        corporation: corp._id,
        isActive: true
      });
      console.log('➕ Created missing Google-Form circle:', circleName, 'under region:', r.name);
    }

    const circles = await Circle.find({ corporation: corp._id, region: r._id, isActive: true, name: { $in: allowedCircles } })
      .select('_id name region')
      .lean();

    const m = new Map();
    for (const c of circles) {
      const key = parseShortCircleKey(c.name);
      if (key) m.set(key, c);
    }
    targetCircleByRegionId.set(String(r._id), m);
  }

  // Find long-form regions within MKVDC
  const longRegions = await Region.find({ corporation: corp._id, isActive: true, name: { $nin: allowedRegionNames } })
    .select('_id name')
    .lean();

  let movedDivisions = 0;
  let movedEntries = 0;
  let skippedCircles = 0;

  for (const longRegion of longRegions) {
    const regionKey = regionLongToShortKey(longRegion.name);
    if (!regionKey) continue;

    const targetRegion = targetRegionByKey.get(regionKey);
    if (!targetRegion) continue;

    const longCircles = await Circle.find({ corporation: corp._id, region: longRegion._id, isActive: true })
      .select('_id name')
      .lean();

    const targetCircleMap = targetCircleByRegionId.get(String(targetRegion._id)) || new Map();

    for (const longCircle of longCircles) {
      const circleKey = circleLongToShortKey(longCircle.name);
      if (!circleKey) {
        skippedCircles++;
        continue;
      }

      const targetCircle = findTargetCircleWithFallback(targetCircleMap, circleKey);
      if (!targetCircle) {
        skippedCircles++;
        continue;
      }

      // Move divisions
      const divRes = await Division.updateMany(
        { circle: longCircle._id, isActive: true },
        { $set: { circle: targetCircle._id, region: targetRegion._id, corporation: corp._id } }
      );
      movedDivisions += divRes.modifiedCount || 0;

      // Move existing KRA entries to keep reporting consistent
      const entryRes = await KraMonthlyEntry.updateMany(
        { corporation: corp._id, circle: longCircle._id },
        { $set: { region: targetRegion._id, circle: targetCircle._id } }
      );
      movedEntries += entryRes.modifiedCount || 0;
    }
  }

  console.log('✅ MKVDC migration complete');
  console.log('Divisions moved:', movedDivisions);
  console.log('KRA entries updated:', movedEntries);
  console.log('Circles skipped (no match):', skippedCircles);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
