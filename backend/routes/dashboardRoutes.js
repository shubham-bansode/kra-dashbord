const express = require('express');
const router = express.Router();
const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const mongoose = require('mongoose');
const Kra = require('../models/Kra');
const Division = require('../models/Division');
const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

function toObjectId(value) {
  if (!value) return null;
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function buildBaseMatch(query) {
  const match = {};

  const corporationId = toObjectId(query.corporation);
  const regionId = toObjectId(query.region);
  const circleId = toObjectId(query.circle);
  const divisionId = toObjectId(query.division);

  if (corporationId) match.corporation = corporationId;
  if (regionId) match.region = regionId;
  if (circleId) match.circle = circleId;
  if (divisionId) match.division = divisionId;

  if (query.kraYear) match.kraYear = String(query.kraYear).trim();

  return match;
}

function isAllPeriods(query) {
  return String(query?.periodMode || '').toLowerCase() === 'all';
}

async function resolveEffectivePeriod({ baseMatch, month, year, preferLatest = true }) {
  const m = toInt(month);
  const y = toInt(year);
  if (m && y) return { month: m, year: y };

  if (!preferLatest) return null;

  const latest = await KraMonthlyEntry.find(baseMatch)
    .sort({ achievementYear: -1, achievementMonth: -1 })
    .select('achievementMonth achievementYear')
    .lean();

  const doc = latest?.[0];
  if (!doc?.achievementMonth || !doc?.achievementYear) return null;
  return { month: doc.achievementMonth, year: doc.achievementYear };
}

function previousPeriod(period) {
  if (!period) return null;
  const m = period.month;
  const y = period.year;
  if (!m || !y) return null;
  if (m === 1) return { month: 12, year: y - 1 };
  return { month: m - 1, year: y };
}

function getGrouping(query) {
  const groupByRaw = String(query.groupBy || '').toLowerCase();
  if (groupByRaw === 'corporation') {
    return {
      groupBy: 'corporation',
      entityField: 'corporation',
      snapshotNameField: 'corporationName',
      idField: '$corporation',
      ensureNonNull: true,
      lookup: { from: 'corporations', localField: '_id', foreignField: '_id', as: 'entityInfo' },
      namePath: 'entityInfo.name'
    };
  }
  if (groupByRaw === 'region') {
    return {
      groupBy: 'region',
      entityField: 'region',
      snapshotNameField: 'regionName',
      idField: '$region',
      ensureNonNull: true,
      lookup: { from: 'regions', localField: '_id', foreignField: '_id', as: 'entityInfo' },
      namePath: 'entityInfo.name'
    };
  }
  if (groupByRaw === 'circle') {
    return {
      groupBy: 'circle',
      entityField: 'circle',
      snapshotNameField: 'circleName',
      idField: '$circle',
      ensureNonNull: true,
      lookup: { from: 'circles', localField: '_id', foreignField: '_id', as: 'entityInfo' },
      namePath: 'entityInfo.name'
    };
  }
  if (groupByRaw === 'division') {
    return {
      groupBy: 'division',
      entityField: 'division',
      snapshotNameField: 'divisionName',
      idField: '$division',
      ensureNonNull: true,
      lookup: { from: 'divisions', localField: '_id', foreignField: '_id', as: 'entityInfo' },
      namePath: 'entityInfo.name'
    };
  }
  return {
    groupBy: 'corporation',
    entityField: 'corporation',
    snapshotNameField: 'corporationName',
    idField: '$corporation',
    ensureNonNull: true,
    lookup: { from: 'corporations', localField: '_id', foreignField: '_id', as: 'entityInfo' },
    namePath: 'entityInfo.name'
  };
}

function getEntityPresenceMatchStage(grouping) {
  if (!grouping?.ensureNonNull || !grouping?.entityField) return [];
  return [{ $match: { [grouping.entityField]: { $ne: null } } }];
}

function entityNameProjection(grouping) {
  const prefixByGroup = {
    corporation: 'Corporation',
    region: 'Region',
    circle: 'Circle',
    division: 'Division'
  };
  const prefix = prefixByGroup[grouping?.groupBy] || 'Entity';
  return {
    $let: {
      vars: {
        resolvedName: {
          $ifNull: [{ $arrayElemAt: [`$${grouping.namePath}`, 0] }, '']
        },
        snapshotName: {
          $ifNull: ['$snapshotName', '']
        },
        entityIdStr: { $toString: '$_id' }
      },
      in: {
        $cond: {
          if: { $gt: [{ $strLenCP: { $trim: { input: '$$resolvedName' } } }, 0] },
          then: '$$resolvedName',
          else: {
            $cond: {
              if: { $gt: [{ $strLenCP: { $trim: { input: '$$snapshotName' } } }, 0] },
              then: '$$snapshotName',
              else: { $concat: [prefix, ' #', { $substrCP: ['$$entityIdStr', 18, 6] }] }
            }
          }
        }
      }
    }
  };
}

function isFallbackEntityLabel(name, grouping) {
  const prefixByGroup = {
    corporation: 'Corporation',
    region: 'Region',
    circle: 'Circle',
    division: 'Division'
  };
  const prefix = prefixByGroup[grouping?.groupBy] || 'Entity';
  return String(name || '').startsWith(`${prefix} #`);
}

async function backfillCorporationNamesFromDivisionSnapshots(rows, grouping) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (grouping?.groupBy !== 'corporation') return rows;

  const unresolvedIds = rows
    .filter((row) => row?._id && isFallbackEntityLabel(row.name, grouping))
    .map((row) => String(row._id));

  if (unresolvedIds.length === 0) return rows;

  const unresolvedObjectIds = unresolvedIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (unresolvedObjectIds.length === 0) return rows;

  const snapshots = await KraMonthlyEntry.aggregate([
    {
      $match: {
        corporation: { $in: unresolvedObjectIds },
        divisionName: { $exists: true, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$corporation',
        divisionNames: { $addToSet: '$divisionName' }
      }
    }
  ]);

  const allDivisionNames = snapshots
    .flatMap((row) => row.divisionNames || [])
    .filter((name) => String(name || '').trim().length > 0);

  if (allDivisionNames.length === 0) return rows;

  const divisions = await Division.find({ name: { $in: allDivisionNames } })
    .populate('corporation', 'name')
    .select('name corporation')
    .lean();

  const divisionToCorporationName = new Map();
  for (const division of divisions) {
    const divisionName = String(division?.name || '').trim();
    const corporationName = String(division?.corporation?.name || '').trim();
    if (!divisionName || !corporationName) continue;
    if (!divisionToCorporationName.has(divisionName)) {
      divisionToCorporationName.set(divisionName, corporationName);
    }
  }

  const inferredCorpNameById = new Map();
  for (const row of snapshots) {
    const corpId = String(row?._id || '');
    if (!corpId) continue;

    const names = Array.isArray(row?.divisionNames) ? row.divisionNames : [];
    const inferred = names
      .map((name) => divisionToCorporationName.get(String(name || '').trim()) || '')
      .find((name) => name.length > 0);

    if (inferred) inferredCorpNameById.set(corpId, inferred);
  }

  return rows.map((row) => {
    const corpId = String(row?._id || '');
    if (!corpId || !isFallbackEntityLabel(row.name, grouping)) return row;
    const inferredName = inferredCorpNameById.get(corpId);
    if (!inferredName) return row;
    return { ...row, name: inferredName };
  });
}

async function getScopedEntitiesForGrouping(grouping, baseMatch = {}) {
  const g = grouping?.groupBy;

  if (g === 'corporation') {
    const filter = {};
    if (baseMatch?.corporation) filter._id = baseMatch.corporation;
    return Corporation.find(filter).select('_id name').sort({ name: 1 }).lean();
  }

  if (g === 'region') {
    const filter = {};
    if (baseMatch?.corporation) filter.corporation = baseMatch.corporation;
    if (baseMatch?.region) filter._id = baseMatch.region;
    return Region.find(filter).select('_id name').sort({ name: 1 }).lean();
  }

  if (g === 'circle') {
    const filter = {};
    if (baseMatch?.corporation) filter.corporation = baseMatch.corporation;
    if (baseMatch?.region) filter.region = baseMatch.region;
    if (baseMatch?.circle) filter._id = baseMatch.circle;
    return Circle.find(filter).select('_id name').sort({ name: 1 }).lean();
  }

  if (g === 'division') {
    const filter = {};
    if (baseMatch?.corporation) filter.corporation = baseMatch.corporation;
    if (baseMatch?.region) filter.region = baseMatch.region;
    if (baseMatch?.circle) filter.circle = baseMatch.circle;
    if (baseMatch?.division) filter._id = baseMatch.division;
    return Division.find(filter).select('_id name').sort({ name: 1 }).lean();
  }

  return [];
}

function withZeroFilledEntities(rows = [], entities = []) {
  const byId = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [String(row?._id || ''), row])
  );

  return (Array.isArray(entities) ? entities : [])
    .map((entity) => {
      const id = String(entity?._id || '');
      if (!id) return null;
      const existing = byId.get(id);
      if (existing) {
        return {
          ...existing,
          _id: entity._id,
          name: String(existing?.name || '').trim() || String(entity?.name || '').trim() || 'Unknown',
          totalAchievement: Number(existing?.totalAchievement || 0),
          totalTarget: Number(existing?.totalTarget || 0),
          achievementPercentage: Number(existing?.achievementPercentage || 0)
        };
      }

      return {
        _id: entity._id,
        name: String(entity?.name || '').trim() || 'Unknown',
        totalAchievement: 0,
        totalTarget: 0,
        achievementPercentage: 0
      };
    })
    .filter(Boolean);
}

async function resolveKraIdParam(kraParam) {
  if (!kraParam) return null;

  const parsed = parseInt(kraParam, 10);
  if (!Number.isNaN(parsed)) return parsed;

  if (mongoose.isValidObjectId(kraParam)) {
    const kraDoc = await Kra.findById(kraParam).select('kraNumber');
    if (kraDoc?.kraNumber) return kraDoc.kraNumber;
  }

  return null;
}

function buildKraUnwindPipeline({ baseMatch, kraId }) {
  const pipeline = [{ $match: baseMatch }, { $unwind: '$kras' }];
  if (kraId) pipeline.push({ $match: { 'kras.kraId': kraId } });
  return pipeline;
}

function achievementExpr() {
  return { $ifNull: ['$kras.kraAchievement', 0] };
}

function targetExpr() {
  // Note: In the current Excel export, the column is named “KRA वार्षिक उद्दिष्ट”,
  // but the percentage in the sheet matches (achievement / annualTarget).
  // So we treat annualTarget as the monthly target denominator for dashboard %.
  return { $ifNull: ['$kras.annualTarget', 0] };
}

function percentageProject({ achievementField, targetField }) {
  return {
    $cond: {
      if: { $gt: [targetField, 0] },
      then: {
        $round: [{ $multiply: [{ $divide: [achievementField, targetField] }, 100] }, 2]
      },
      else: 0
    }
  };
}

// GET dashboard summary statistics
router.get('/summary', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });

    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const totalEntries = await KraMonthlyEntry.countDocuments(match);

    const aggregation = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: null,
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() },
          avgAchievement: { $avg: achievementExpr() },
          avgTarget: { $avg: targetExpr() }
        }
      }
    ]);

    const stats = aggregation[0] || { totalAchievement: 0, totalTarget: 0, avgAchievement: 0, avgTarget: 0 };

    const grouping = getGrouping(req.query);
    const bestWorst = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: grouping.idField,
          snapshotName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({
            achievementField: '$totalAchievement',
            targetField: '$totalTarget'
          })
        }
      },
      { $sort: { achievementPercentage: -1 } },
      { $limit: 1 },
      { $lookup: grouping.lookup },
      {
        $project: {
          _id: 1,
          name: entityNameProjection(grouping),
          achievementPercentage: 1
        }
      }
    ]);

    const worst = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: grouping.idField,
          snapshotName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({
            achievementField: '$totalAchievement',
            targetField: '$totalTarget'
          })
        }
      },
      { $sort: { achievementPercentage: 1 } },
      { $limit: 1 },
      { $lookup: grouping.lookup },
      {
        $project: {
          _id: 1,
          name: entityNameProjection(grouping),
          achievementPercentage: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        totalEntries,
        totalAchievement: Math.round(stats.totalAchievement * 100) / 100,
        totalTarget: Math.round(stats.totalTarget * 100) / 100,
        avgAchievement: Math.round(stats.avgAchievement * 100) / 100,
        avgTarget: Math.round(stats.avgTarget * 100) / 100,
        achievementPercentage: stats.totalTarget > 0 
          ? Math.round((stats.totalAchievement / stats.totalTarget) * 100 * 100) / 100 
          : 0,
        bestPerformer: bestWorst?.[0] || null,
        worstPerformer: worst?.[0] || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching summary',
      error: error.message
    });
  }
});

// GET achievements by corporation
router.get('/by-corporation', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });

    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const data = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: '$corporation',
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() },
          submissionIds: { $addToSet: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'corporations',
          localField: '_id',
          foreignField: '_id',
          as: 'corporationInfo'
        }
      },
      {
        $project: {
          _id: 1,
          corporationName: { $arrayElemAt: ['$corporationInfo.name', 0] },
          corporationCode: { $arrayElemAt: ['$corporationInfo.code', 0] },
          totalAchievement: { $round: ['$totalAchievement', 2] },
          totalTarget: { $round: ['$totalTarget', 2] },
          count: { $size: '$submissionIds' },
          achievementPercentage: {
            $cond: {
              if: { $gt: ['$totalTarget', 0] },
              then: { $round: [{ $multiply: [{ $divide: ['$totalAchievement', '$totalTarget'] }, 100] }, 2] },
              else: 0
            }
          }
        }
      },
      { $sort: { totalAchievement: -1 } }
    ]);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching data by corporation',
      error: error.message
    });
  }
});

// GET achievements by KRA
router.get('/by-kra', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });

    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const data = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: '$kras.kraId',
          kraName: { $first: '$kras.kraName' },
          weight: { $first: '$kras.weight' },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() },
          submissionIds: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          _id: 1,
          kraId: '$_id',
          kraName: 1,
          weight: 1,
          totalAchievement: { $round: ['$totalAchievement', 2] },
          totalTarget: { $round: ['$totalTarget', 2] },
          count: { $size: '$submissionIds' },
          achievementPercentage: {
            $cond: {
              if: { $gt: ['$totalTarget', 0] },
              then: { $round: [{ $multiply: [{ $divide: ['$totalAchievement', '$totalTarget'] }, 100] }, 2] },
              else: 0
            }
          }
        }
      },
      { $sort: { kraId: 1 } }
    ]);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching data by KRA',
      error: error.message
    });
  }
});

// GET monthly trend
router.get('/monthly-trend', async (req, res) => {
  try {
    const filter = buildBaseMatch(req.query);
    const resolvedKraId = await resolveKraIdParam(req.query.kraId || req.query.kra);
    const pipeline = buildKraUnwindPipeline({ baseMatch: filter, kraId: resolvedKraId });

    pipeline.push(
      {
        $group: {
          _id: {
            year: '$achievementYear',
            month: '$achievementMonth'
          },
          totalAchievement: { $sum: '$kras.kraAchievement' },
          totalTarget: { $sum: '$kras.annualTarget' },
          submissionIds: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          totalAchievement: { $round: ['$totalAchievement', 2] },
          totalTarget: { $round: ['$totalTarget', 2] },
          count: { $size: '$submissionIds' },
          monthName: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id.month', 1] }, then: 'Jan' },
                { case: { $eq: ['$_id.month', 2] }, then: 'Feb' },
                { case: { $eq: ['$_id.month', 3] }, then: 'Mar' },
                { case: { $eq: ['$_id.month', 4] }, then: 'Apr' },
                { case: { $eq: ['$_id.month', 5] }, then: 'May' },
                { case: { $eq: ['$_id.month', 6] }, then: 'Jun' },
                { case: { $eq: ['$_id.month', 7] }, then: 'Jul' },
                { case: { $eq: ['$_id.month', 8] }, then: 'Aug' },
                { case: { $eq: ['$_id.month', 9] }, then: 'Sep' },
                { case: { $eq: ['$_id.month', 10] }, then: 'Oct' },
                { case: { $eq: ['$_id.month', 11] }, then: 'Nov' },
                { case: { $eq: ['$_id.month', 12] }, then: 'Dec' }
              ],
              default: 'Unknown'
            }
          }
        }
      },
      { $sort: { year: 1, month: 1 } }
    );

    const data = await KraMonthlyEntry.aggregate(pipeline);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly trend',
      error: error.message
    });
  }
});

// GET available periods (month/year) for the given filters
router.get('/periods', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const data = await KraMonthlyEntry.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { year: '$achievementYear', month: '$achievementMonth' }
        }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month'
        }
      },
      { $sort: { year: -1, month: -1 } }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching periods', error: error.message });
  }
});

// GET corporation-wise KRA performance pie data (IDC-wise dashboard)
// Returns slices that sum to 100 per corporation based on weighted score share.
// score = weight * achievementPercentage, slice% = score / sum(score) * 100
router.get('/corp-kra-performance', async (req, res) => {
  try {
    const match = {};
    const corporationId = toObjectId(req.query.corporation);
    if (corporationId) match.corporation = corporationId;
    if (req.query.kraYear) match.kraYear = String(req.query.kraYear).trim();

    const period = await resolveEffectivePeriod({
      baseMatch: match,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });

    const scopedMatch = { ...match };
    if (period) {
      scopedMatch.achievementMonth = period.month;
      scopedMatch.achievementYear = period.year;
    }

    const data = await KraMonthlyEntry.aggregate([
      { $match: scopedMatch },
      { $unwind: '$kras' },
      {
        $group: {
          _id: { corporation: '$corporation', kraId: '$kras.kraId' },
          kraName: { $first: '$kras.kraName' },
          weight: { $max: { $ifNull: ['$kras.weight', 0] } },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      {
        $addFields: {
          achievementPercentage: percentageProject({
            achievementField: '$totalAchievement',
            targetField: '$totalTarget'
          })
        }
      },
      {
        $addFields: {
          score: { $multiply: ['$achievementPercentage', '$weight'] }
        }
      },
      {
        $group: {
          _id: '$_id.corporation',
          totalScore: { $sum: '$score' },
          items: {
            $push: {
              kraId: '$_id.kraId',
              kraName: '$kraName',
              weight: '$weight',
              achievementPercentage: '$achievementPercentage',
              score: '$score'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'corporations',
          localField: '_id',
          foreignField: '_id',
          as: 'corp'
        }
      },
      {
        $project: {
          _id: 0,
          corporationId: '$_id',
          corporationName: { $arrayElemAt: ['$corp.name', 0] },
          corporationCode: { $arrayElemAt: ['$corp.code', 0] },
          period: period,
          data: {
            $map: {
              input: '$items',
              as: 'it',
              in: {
                kraId: '$$it.kraId',
                kraName: '$$it.kraName',
                weight: '$$it.weight',
                achievementPercentage: '$$it.achievementPercentage',
                slicePercentage: {
                  $cond: {
                    if: { $gt: ['$totalScore', 0] },
                    then: {
                      $round: [
                        { $multiply: [{ $divide: ['$$it.score', '$totalScore'] }, 100] },
                        2
                      ]
                    },
                    else: 0
                  }
                }
              }
            }
          }
        }
      },
      { $sort: { corporationCode: 1 } }
    ]);

    res.json({ success: true, period, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching corporation KRA performance', error: error.message });
  }
});

// GET circle/division wise achievement bar chart data
router.get('/achievement-bar', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);
    const grouping = getGrouping(req.query);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });

    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const mode = String(req.query.mode || 'top').toLowerCase(); // top | bottom
    const rawLimit = String(req.query.limit || '').trim().toLowerCase();
    const limit = rawLimit === 'all'
      ? null
      : Math.min(Math.max(toInt(req.query.limit) || 5, 1), 1000);

    const rawData = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: grouping.idField,
          snapshotName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({
            achievementField: '$totalAchievement',
            targetField: '$totalTarget'
          })
        }
      },
      { $lookup: grouping.lookup },
      {
        $project: {
          _id: 1,
          name: entityNameProjection(grouping),
          totalAchievement: { $round: ['$totalAchievement', 2] },
          totalTarget: { $round: ['$totalTarget', 2] },
          achievementPercentage: 1
        }
      }
    ]);

    const entities = await getScopedEntitiesForGrouping(grouping, baseMatch);
    const mergedRows = entities.length > 0
      ? withZeroFilledEntities(rawData, entities)
      : (Array.isArray(rawData) ? rawData : []);

    const sortedRows = [...mergedRows].sort((a, b) => {
      const aPct = Number(a?.achievementPercentage || 0);
      const bPct = Number(b?.achievementPercentage || 0);
      if (mode === 'bottom') {
        if (aPct !== bPct) return aPct - bPct;
      } else {
        if (aPct !== bPct) return bPct - aPct;
      }
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });

    const limitedRows = limit === null ? sortedRows : sortedRows.slice(0, limit);
    const data = await backfillCorporationNamesFromDivisionSnapshots(limitedRows, grouping);

    res.json({ success: true, period, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching achievement bar', error: error.message });
  }
});

// GET improvement required list (lowest performers)
router.get('/improvement-required', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);
    const grouping = getGrouping(req.query);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });

    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const limit = Math.min(Math.max(toInt(req.query.limit) || 10, 1), 100);

    const data = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: grouping.idField,
          snapshotName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({
            achievementField: '$totalAchievement',
            targetField: '$totalTarget'
          })
        }
      },
      {
        $addFields: {
          gapPercentage: {
            $cond: {
              if: { $gt: ['$totalTarget', 0] },
              then: { $round: [{ $subtract: [100, '$achievementPercentage'] }, 2] },
              else: 0
            }
          }
        }
      },
      { $lookup: grouping.lookup },
      {
        $project: {
          _id: 1,
          name: entityNameProjection(grouping),
          achievementPercentage: 1,
          gapPercentage: 1
        }
      },
      { $sort: { achievementPercentage: 1 } },
      { $limit: limit }
    ]);

    res.json({ success: true, period, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching improvement required', error: error.message });
  }
});

// GET KRA weightage distribution
router.get('/weightage-distribution', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });
    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const data = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: '$kras.kraId',
          kraName: { $first: '$kras.kraName' },
          weight: { $max: { $ifNull: ['$kras.weight', 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          kraId: '$_id',
          kraName: 1,
          weight: { $round: ['$weight', 2] }
        }
      },
      { $sort: { kraId: 1 } }
    ]);

    res.json({ success: true, period, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching weightage distribution', error: error.message });
  }
});

// GET rank table: previous vs current month, rank and rank change
router.get('/rank-table', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);
    const grouping = getGrouping(req.query);

    // Rank table is inherently month-based; when no explicit month/year is provided,
    // we keep defaulting to the latest available period.
    const current = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: true
    });
    if (!current) {
      return res.json({ success: true, period: null, data: [] });
    }
    const prev = previousPeriod(current);

    const match = {
      ...baseMatch,
      $or: [
        { achievementMonth: current.month, achievementYear: current.year },
        ...(prev ? [{ achievementMonth: prev.month, achievementYear: prev.year }] : [])
      ]
    };

    const rows = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: {
            entity: grouping.idField,
            year: '$achievementYear',
            month: '$achievementMonth'
          },
          entityName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { '_id.entity': { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({
            achievementField: '$totalAchievement',
            targetField: '$totalTarget'
          })
        }
      },
      {
        $project: {
          _id: 0,
          entityId: '$_id.entity',
          year: '$_id.year',
          month: '$_id.month',
          entityName: { $ifNull: ['$entityName', ''] },
          achievementPercentage: 1
        }
      }
    ]);

    const entityIds = [...new Set(rows.map((r) => String(r.entityId)))].map((id) => new mongoose.Types.ObjectId(id));
    const collectionByGroup = {
      corporation: 'corporations',
      region: 'regions',
      circle: 'circles',
      division: 'divisions'
    };
    const entities = await mongoose.connection
      .collection(collectionByGroup[grouping.groupBy] || 'circles')
      .find({ _id: { $in: entityIds } }, { projection: { name: 1 } })
      .toArray();
    const nameById = new Map(entities.map((e) => [String(e._id), e.name]));

    const scopedEntities = await getScopedEntitiesForGrouping(grouping, baseMatch);
    const byEntity = new Map(
      scopedEntities.map((entity) => [
        String(entity?._id || ''),
        {
          entityId: String(entity?._id || ''),
          name: String(entity?.name || '').trim(),
          prev: 0,
          curr: 0
        }
      ])
    );

    for (const r of rows) {
      const key = String(r.entityId);
      const resolvedName =
        String(nameById.get(key) || '').trim() || String(r.entityName || '').trim();
      const entry = byEntity.get(key) || { entityId: key, name: resolvedName, prev: 0, curr: 0 };
      if (r.year === current.year && r.month === current.month) entry.curr = r.achievementPercentage;
      if (prev && r.year === prev.year && r.month === prev.month) entry.prev = r.achievementPercentage;
      byEntity.set(key, entry);
    }

    const list = [...byEntity.values()]
      .filter((x) => x.name)
      .sort((a, b) => {
        if (b.curr !== a.curr) return b.curr - a.curr;
        return String(a.name).localeCompare(String(b.name));
      })
      .map((x, idx) => ({
        ...x,
        rank: idx + 1
      }));

    const prevRanks = [...byEntity.values()]
      .filter((x) => x.name)
      .sort((a, b) => {
        if (b.prev !== a.prev) return b.prev - a.prev;
        return String(a.name).localeCompare(String(b.name));
      })
      .reduce((acc, x, i) => {
        acc.set(x.entityId, i + 1);
        return acc;
      }, new Map());

    const data = list.map((x) => {
      const prevRank = prevRanks.get(x.entityId) || null;
      const rankChange = prevRank ? prevRank - x.rank : null;
      return {
        entityId: x.entityId,
        name: x.name,
        previousMonthPercentage: x.prev,
        currentMonthPercentage: x.curr,
        rank: x.rank,
        rankChange
      };
    });

    res.json({ success: true, period: { current, previous: prev }, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching rank table', error: error.message });
  }
});

// EXPORT: Excel workbook with current filtered datasets
router.get('/export/excel', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);
    const grouping = getGrouping(req.query);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });
    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const totalEntries = await KraMonthlyEntry.countDocuments(match);

    const aggregation = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: null,
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      }
    ]);
    const stats = aggregation[0] || { totalAchievement: 0, totalTarget: 0 };
    const achievementPercentage = stats.totalTarget > 0 ? Math.round((stats.totalAchievement / stats.totalTarget) * 100 * 100) / 100 : 0;

    const best = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: grouping.idField,
          snapshotName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({ achievementField: '$totalAchievement', targetField: '$totalTarget' })
        }
      },
      { $sort: { achievementPercentage: -1 } },
      { $limit: 1 },
      { $lookup: grouping.lookup },
      { $project: { _id: 1, name: entityNameProjection(grouping), achievementPercentage: 1 } }
    ]);

    const worst = await KraMonthlyEntry.aggregate([
      { $match: match },
      ...getEntityPresenceMatchStage(grouping),
      ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
      {
        $group: {
          _id: grouping.idField,
          snapshotName: { $first: `$${grouping.snapshotNameField}` },
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $addFields: {
          achievementPercentage: percentageProject({ achievementField: '$totalAchievement', targetField: '$totalTarget' })
        }
      },
      { $sort: { achievementPercentage: 1 } },
      { $limit: 1 },
      { $lookup: grouping.lookup },
      { $project: { _id: 1, name: entityNameProjection(grouping), achievementPercentage: 1 } }
    ]);

    const achievementBars = period
      ? await KraMonthlyEntry.aggregate([
          { $match: match },
          ...getEntityPresenceMatchStage(grouping),
          ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
          {
            $group: {
              _id: grouping.idField,
              snapshotName: { $first: `$${grouping.snapshotNameField}` },
              totalAchievement: { $sum: achievementExpr() },
              totalTarget: { $sum: targetExpr() }
            }
          },
          { $match: { _id: { $ne: null } } },
          {
            $addFields: {
              achievementPercentage: percentageProject({ achievementField: '$totalAchievement', targetField: '$totalTarget' })
            }
          },
          { $lookup: grouping.lookup },
          {
            $project: {
              _id: 1,
              name: entityNameProjection(grouping),
              totalAchievement: { $round: ['$totalAchievement', 2] },
              totalTarget: { $round: ['$totalTarget', 2] },
              achievementPercentage: 1
            }
          },
          { $sort: { achievementPercentage: -1 } }
        ])
      : [];

    const improvementRequired = period
      ? await KraMonthlyEntry.aggregate([
          { $match: match },
          ...getEntityPresenceMatchStage(grouping),
          ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
          {
            $group: {
              _id: grouping.idField,
              snapshotName: { $first: `$${grouping.snapshotNameField}` },
              totalAchievement: { $sum: achievementExpr() },
              totalTarget: { $sum: targetExpr() }
            }
          },
          { $match: { _id: { $ne: null } } },
          {
            $addFields: {
              achievementPercentage: percentageProject({ achievementField: '$totalAchievement', targetField: '$totalTarget' })
            }
          },
          {
            $addFields: {
              gapPercentage: {
                $cond: {
                  if: { $gt: ['$totalTarget', 0] },
                  then: { $round: [{ $subtract: [100, '$achievementPercentage'] }, 2] },
                  else: 0
                }
              }
            }
          },
          { $lookup: grouping.lookup },
          {
            $project: {
              _id: 1,
              name: entityNameProjection(grouping),
              achievementPercentage: 1,
              gapPercentage: 1
            }
          },
          { $sort: { achievementPercentage: 1 } },
          { $limit: 50 }
        ])
      : [];

    const weightageDistribution = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: '$kras.kraId',
          kraName: { $first: '$kras.kraName' },
          weight: { $max: { $ifNull: ['$kras.weight', 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          kraId: '$_id',
          kraName: 1,
          weight: { $round: ['$weight', 2] }
        }
      },
      { $sort: { kraId: 1 } }
    ]);

    // Rank table (re-use logic)
    const current = period;
    const prev = previousPeriod(current);
    const rankRows = current
      ? await (async () => {
          const rankMatch = {
            ...baseMatch,
            $or: [
              { achievementMonth: current.month, achievementYear: current.year },
              ...(prev ? [{ achievementMonth: prev.month, achievementYear: prev.year }] : [])
            ]
          };

          const rows = await KraMonthlyEntry.aggregate([
            { $match: rankMatch },
            ...getEntityPresenceMatchStage(grouping),
            ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
            {
              $group: {
                _id: { entity: grouping.idField, year: '$achievementYear', month: '$achievementMonth' },
                totalAchievement: { $sum: achievementExpr() },
                totalTarget: { $sum: targetExpr() }
              }
            },
            { $match: { '_id.entity': { $ne: null } } },
            {
              $addFields: {
                achievementPercentage: percentageProject({ achievementField: '$totalAchievement', targetField: '$totalTarget' })
              }
            },
            { $project: { _id: 0, entityId: '$_id.entity', year: '$_id.year', month: '$_id.month', achievementPercentage: 1 } }
          ]);

          const entityIds = [...new Set(rows.map((r) => String(r.entityId)))].map((id) => new mongoose.Types.ObjectId(id));
          const entities = await mongoose.connection
            .collection(grouping.groupBy === 'division' ? 'divisions' : 'circles')
            .find({ _id: { $in: entityIds } }, { projection: { name: 1 } })
            .toArray();
          const nameById = new Map(entities.map((e) => [String(e._id), e.name]));

          const byEntity = new Map();
          for (const r of rows) {
            const key = String(r.entityId);
            const entry = byEntity.get(key) || { entityId: key, name: nameById.get(key) || '', prev: 0, curr: 0 };
            if (r.year === current.year && r.month === current.month) entry.curr = r.achievementPercentage;
            if (prev && r.year === prev.year && r.month === prev.month) entry.prev = r.achievementPercentage;
            byEntity.set(key, entry);
          }

          const list = [...byEntity.values()]
            .filter((x) => x.name)
            .sort((a, b) => b.curr - a.curr)
            .map((x, idx) => ({ ...x, rank: idx + 1 }));

          const prevRanks = [...byEntity.values()]
            .filter((x) => x.name)
            .sort((a, b) => b.prev - a.prev)
            .reduce((acc, x, i) => {
              acc.set(x.entityId, i + 1);
              return acc;
            }, new Map());

          return list.map((x) => {
            const prevRank = prevRanks.get(x.entityId) || null;
            const rankChange = prevRank ? prevRank - x.rank : null;
            return {
              entityId: x.entityId,
              name: x.name,
              previousMonthPercentage: x.prev,
              currentMonthPercentage: x.curr,
              rank: x.rank,
              rankChange
            };
          });
        })()
      : [];

    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet([
      {
        Period: period ? `${String(period.month).padStart(2, '0')}/${period.year}` : 'Latest',
        GroupBy: grouping.groupBy,
        TotalEntries: totalEntries,
        TotalAchievement: Math.round((stats.totalAchievement || 0) * 100) / 100,
        TotalTarget: Math.round((stats.totalTarget || 0) * 100) / 100,
        AchievementPercentage: achievementPercentage,
        BestName: best?.[0]?.name || '',
        BestPercent: best?.[0]?.achievementPercentage || 0,
        WorstName: worst?.[0]?.name || '',
        WorstPercent: worst?.[0]?.achievementPercentage || 0
      }
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const barsSheet = XLSX.utils.json_to_sheet(
      (achievementBars || []).map((r) => ({
        Name: r.name,
        Achievement: r.totalAchievement,
        Target: r.totalTarget,
        Percent: r.achievementPercentage
      }))
    );
    XLSX.utils.book_append_sheet(wb, barsSheet, 'Performance');

    const improvementSheet = XLSX.utils.json_to_sheet(
      (improvementRequired || []).map((r) => ({
        Name: r.name,
        AchievementPercent: r.achievementPercentage,
        GapPercent: r.gapPercentage
      }))
    );
    XLSX.utils.book_append_sheet(wb, improvementSheet, 'Improvement');

    const weightSheet = XLSX.utils.json_to_sheet(
      (weightageDistribution || []).map((r) => ({
        KraId: r.kraId,
        KraName: r.kraName,
        Weight: r.weight
      }))
    );
    XLSX.utils.book_append_sheet(wb, weightSheet, 'Weightage');

    const rankSheet = XLSX.utils.json_to_sheet(
      (rankRows || []).map((r) => ({
        Rank: r.rank,
        Name: r.name,
        PrevPercent: r.previousMonthPercentage,
        CurrPercent: r.currentMonthPercentage,
        RankChange: r.rankChange
      }))
    );
    XLSX.utils.book_append_sheet(wb, rankSheet, 'Rank');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const filename = `kra-dashboard-${period ? `${period.year}-${String(period.month).padStart(2, '0')}` : 'latest'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error exporting excel', error: error.message });
  }
});

// EXPORT: Server-generated PDF summary (simple tabular PDF)
router.get('/export/pdf', async (req, res) => {
  try {
    const baseMatch = buildBaseMatch(req.query);
    const kraId = await resolveKraIdParam(req.query.kra);
    const grouping = getGrouping(req.query);

    const period = await resolveEffectivePeriod({
      baseMatch,
      month: req.query.month,
      year: req.query.year,
      preferLatest: !isAllPeriods(req.query)
    });
    const match = { ...baseMatch };
    if (period) {
      match.achievementMonth = period.month;
      match.achievementYear = period.year;
    }

    const totalEntries = await KraMonthlyEntry.countDocuments(match);

    const aggregation = await KraMonthlyEntry.aggregate([
      ...buildKraUnwindPipeline({ baseMatch: match, kraId }),
      {
        $group: {
          _id: null,
          totalAchievement: { $sum: achievementExpr() },
          totalTarget: { $sum: targetExpr() }
        }
      }
    ]);
    const stats = aggregation[0] || { totalAchievement: 0, totalTarget: 0 };
    const achievementPercentage = stats.totalTarget > 0 ? Math.round((stats.totalAchievement / stats.totalTarget) * 100 * 100) / 100 : 0;

    const bars = period
      ? await KraMonthlyEntry.aggregate([
          { $match: match },
          ...getEntityPresenceMatchStage(grouping),
          ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
          {
            $group: {
              _id: grouping.idField,
              snapshotName: { $first: `$${grouping.snapshotNameField}` },
              totalAchievement: { $sum: achievementExpr() },
              totalTarget: { $sum: targetExpr() }
            }
          },
          { $match: { _id: { $ne: null } } },
          {
            $addFields: {
              achievementPercentage: percentageProject({ achievementField: '$totalAchievement', targetField: '$totalTarget' })
            }
          },
          { $lookup: grouping.lookup },
          {
            $project: {
              _id: 0,
              name: entityNameProjection(grouping),
              achievementPercentage: 1
            }
          },
          { $sort: { achievementPercentage: -1 } },
          { $limit: 15 }
        ])
      : [];

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      const filename = `kra-dashboard-${period ? `${period.year}-${String(period.month).padStart(2, '0')}` : 'latest'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdf);
    });

    doc.fontSize(16).text('KRA Dashboard Export', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Period: ${period ? `${String(period.month).padStart(2, '0')}/${period.year}` : 'Latest'}`);
    doc.text(`Group By: ${grouping.groupBy}`);
    doc.moveDown(0.5);
    doc.text(`Total Entries: ${totalEntries}`);
    doc.text(`Total Achievement: ${Math.round((stats.totalAchievement || 0) * 100) / 100}`);
    doc.text(`Total Target: ${Math.round((stats.totalTarget || 0) * 100) / 100}`);
    doc.text(`Achievement %: ${achievementPercentage}`);
    doc.moveDown(1);

    doc.fontSize(12).text('Top Performers', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    if (bars.length === 0) {
      doc.text('No data');
    } else {
      bars.forEach((r, idx) => {
        doc.text(`${idx + 1}. ${r.name} - ${Number(r.achievementPercentage || 0).toFixed(2)}%`);
      });
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error exporting pdf', error: error.message });
  }
});

module.exports = router;
