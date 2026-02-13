const mongoose = require('mongoose');

const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');

const SHORT_REGION_CODE_MAX_LEN = 5;
const SHORT_CIRCLE_CODE_MAX_LEN = 3;

function safeStr(value) {
  return String(value ?? '').trim();
}

function isShortCode(code, maxLen) {
  const s = safeStr(code);
  return s.length > 0 && s.length <= maxLen;
}

function isShortRegionDoc(regionDoc) {
  return isShortCode(regionDoc?.code, SHORT_REGION_CODE_MAX_LEN);
}

function isShortCircleDoc(circleDoc) {
  return isShortCode(circleDoc?.code, SHORT_CIRCLE_CODE_MAX_LEN);
}

function extractAbbrevKeyFromName(name) {
  const head = safeStr(name).split(',')[0];
  // Remove spaces/punctuation so "CE WRD" becomes "CEWRD".
  const key = head.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return key;
}

function filterToShortByCodeLength(docs, maxLen) {
  const list = Array.isArray(docs) ? docs : [];
  return list.filter((d) => isShortCode(d?.code, maxLen));
}

function filterRegionsToShortForm(regions) {
  return filterToShortByCodeLength(regions, SHORT_REGION_CODE_MAX_LEN);
}

function filterCirclesToShortForm(circles) {
  return filterToShortByCodeLength(circles, SHORT_CIRCLE_CODE_MAX_LEN);
}

async function resolveCanonicalRegionIdByShortKey(corporationId, regionId) {
  if (!mongoose.isValidObjectId(regionId)) return regionId;
  const regionDoc = await Region.findById(regionId).select('_id name code corporation').lean();
  if (!regionDoc) return regionId;
  if (!String(regionDoc.corporation) || String(regionDoc.corporation) !== String(corporationId)) return regionId;
  if (!isShortRegionDoc(regionDoc)) return regionId;

  const key = extractAbbrevKeyFromName(regionDoc.name);
  if (key.length < 2) return regionId;

  const candidates = await Region.find({
    corporation: corporationId,
    code: { $regex: key, $options: 'i' }
  })
    .select('_id code')
    .lean();

  const longCandidates = candidates.filter((c) => !isShortCode(c?.code, SHORT_REGION_CODE_MAX_LEN));
  if (longCandidates.length === 1) return longCandidates[0]._id;

  return regionId;
}

async function resolveCanonicalCircleIdForDivisionLookup(circleId) {
  if (!mongoose.isValidObjectId(circleId)) return circleId;

  // If the selected circle already has divisions, prefer it.
  const hasDivisions = (await Division.countDocuments({ circle: circleId, isActive: true })) > 0;
  if (hasDivisions) return circleId;

  const circleDoc = await Circle.findById(circleId).select('_id name code corporation').lean();
  if (!circleDoc) return circleId;
  if (!isShortCircleDoc(circleDoc)) return circleId;

  const corporationId = circleDoc.corporation;
  const key = extractAbbrevKeyFromName(circleDoc.name);
  if (key.length < 2) return circleId;

  const candidates = await Circle.find({
    corporation: corporationId,
    code: { $regex: key, $options: 'i' }
  })
    .select('_id code')
    .lean();

  const longCandidates = candidates.filter((c) => !isShortCode(c?.code, SHORT_CIRCLE_CODE_MAX_LEN));
  if (longCandidates.length === 0) return circleId;

  // Prefer a long candidate that actually has divisions.
  const withDivisions = [];
  for (const c of longCandidates) {
    const count = await Division.countDocuments({ circle: c._id, isActive: true });
    if (count > 0) withDivisions.push(c);
  }

  if (withDivisions.length === 1) return withDivisions[0]._id;
  if (withDivisions.length > 1) return circleId;

  // No divisions found on any long candidate; do not switch.
  return circleId;
}

async function resolveCanonicalCircleIdForSubmission(corporationId, circleId) {
  if (!mongoose.isValidObjectId(circleId)) return circleId;

  const circleDoc = await Circle.findById(circleId).select('_id name code corporation').lean();
  if (!circleDoc) return circleId;
  if (String(circleDoc.corporation) !== String(corporationId)) return circleId;

  // If divisions already exist for the chosen circle, keep it.
  const hasDivisions = (await Division.countDocuments({ circle: circleId, isActive: true })) > 0;
  if (hasDivisions) return circleId;

  if (!isShortCircleDoc(circleDoc)) return circleId;

  const key = extractAbbrevKeyFromName(circleDoc.name);
  if (key.length < 2) return circleId;

  const candidates = await Circle.find({
    corporation: corporationId,
    code: { $regex: key, $options: 'i' }
  })
    .select('_id code')
    .lean();

  const longCandidates = candidates.filter((c) => !isShortCode(c?.code, SHORT_CIRCLE_CODE_MAX_LEN));
  if (longCandidates.length === 0) return circleId;

  const withDivisions = [];
  for (const c of longCandidates) {
    const count = await Division.countDocuments({ circle: c._id, isActive: true });
    if (count > 0) withDivisions.push(c);
  }

  if (withDivisions.length === 1) return withDivisions[0]._id;

  return circleId;
}

module.exports = {
  SHORT_REGION_CODE_MAX_LEN,
  SHORT_CIRCLE_CODE_MAX_LEN,
  filterRegionsToShortForm,
  filterCirclesToShortForm,
  resolveCanonicalRegionIdByShortKey,
  resolveCanonicalCircleIdForDivisionLookup,
  resolveCanonicalCircleIdForSubmission,
  extractAbbrevKeyFromName
};
