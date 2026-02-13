const Circle = require('../models/Circle');
const Region = require('../models/Region');

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value).toUpperCase();
}

function isMkvdcPuneCorporation(corporationDoc) {
  const raw = normalizeText(corporationDoc?.name);
  const normalized = normalizeKey(raw).replace(/,/g, '');
  return normalized === 'MKVDC PUNE';
}

function looksLikeAcronymOnly(value) {
  const name = normalizeText(value);
  // e.g. "PR", "CC", "KIC" (optionally with digits)
  return /^[A-Z0-9]{2,10}$/.test(name);
}

function isShortFormRegionNameForMkvdcPune(regionName) {
  return Boolean(parseShortRegionKey(regionName)) || looksLikeAcronymOnly(regionName);
}

function isShortFormCircleNameForMkvdcPune(circleName) {
  return Boolean(parseShortCircleKey(circleName)) || looksLikeAcronymOnly(circleName);
}

function parseShortCircleKey(circleName) {
  const name = normalizeText(circleName);
  if (!name) return null;

  // Short-form examples: "KIC, Pune", "PIPC,Pune", "CADA, Solapur"
  // We treat anything without '-' and without long role descriptors as a short alias.
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

  // Typical long name: "Superintending Engineer, Kukadi Irrigation Circle - Pune (M Corp.)"
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

function parseShortRegionKey(regionName) {
  const name = normalizeText(regionName);
  if (!name) return null;

  // Short-form examples: "CE SP, Pune", "CE WRD, Pune"
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

async function resolveCanonicalRegionIdForMkvdcPune(corporationDoc, regionId) {
  if (!regionId) return regionId;
  if (!isMkvdcPuneCorporation(corporationDoc)) return regionId;

  const region = await Region.findById(regionId).select('name corporation').lean();
  if (!region) return regionId;
  if (String(region.corporation) !== String(corporationDoc._id)) return regionId;

  const shortKey = parseShortRegionKey(region.name);
  if (!shortKey) return regionId;

  const candidates = await Region.find({ corporation: corporationDoc._id, isActive: true })
    .select('name')
    .sort({ name: 1 })
    .lean();

  const match = candidates.find((r) => regionLongToShortKey(r.name) === shortKey);
  return match?._id || regionId;
}

async function resolveCanonicalCircleIdForMkvdcPune(corporationDoc, circleId) {
  if (!circleId) return circleId;
  if (!isMkvdcPuneCorporation(corporationDoc)) return circleId;

  const circle = await Circle.findById(circleId).select('name corporation').lean();
  if (!circle) return circleId;
  if (String(circle.corporation) !== String(corporationDoc._id)) return circleId;

  const shortKey = parseShortCircleKey(circle.name);
  if (!shortKey) return circleId;

  const candidates = await Circle.find({ corporation: corporationDoc._id, isActive: true })
    .select('name')
    .sort({ name: 1 })
    .lean();

  const match = candidates.find((c) => circleLongToShortKey(c.name) === shortKey);
  return match?._id || circleId;
}

module.exports = {
  isMkvdcPuneCorporation,
  resolveCanonicalRegionIdForMkvdcPune,
  resolveCanonicalCircleIdForMkvdcPune,
  isShortFormRegionNameForMkvdcPune,
  isShortFormCircleNameForMkvdcPune
};
