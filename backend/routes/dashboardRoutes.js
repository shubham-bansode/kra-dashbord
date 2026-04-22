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

function expandKraYearVariants(rawYear) {
  const value = String(rawYear || '').trim();
  if (!value) return [];

  const shortFyMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (shortFyMatch) {
    const start = Number(shortFyMatch[1]);
    const endShort = Number(shortFyMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(endShort)) {
      const century = Math.floor(start / 100) * 100;
      const endFull = century + endShort;
      return [value, `${start}-${endFull}`];
    }
  }

  return [value];
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

  if (query.kraYear) {
    const variants = expandKraYearVariants(query.kraYear);
    match.kraYear = variants.length > 1 ? { $in: variants } : variants[0];
  }

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
  if (groupByRaw === 'all') {
    return {
      groupBy: 'all',
      entityField: null,
      snapshotNameField: null,
      idField: null,
      ensureNonNull: false,
      lookup: null,
      namePath: null
    };
  }
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

  if (g === 'all') {
    return [{ _id: 'all', name: 'All Corporations (Average)' }];
  }

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

function roundToTwo(n) {
  const value = Number(n || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function normalizeSlicePercentages(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) return [];

  const rounded = rows.map((item) => ({
    ...item,
    slicePercentage: roundToTwo(item?.slicePercentage)
  }));

  const total = roundToTwo(
    rounded.reduce((sum, item) => sum + Number(item?.slicePercentage || 0), 0)
  );

  // No contribution available (e.g., all targets are zero).
  if (total <= 0) {
    return rounded.map((item) => ({ ...item, slicePercentage: 0 }));
  }

  const delta = roundToTwo(100 - total);
  if (Math.abs(delta) < 0.01) return rounded;

  let maxIdx = 0;
  for (let i = 1; i < rounded.length; i += 1) {
    if ((rounded[i]?.slicePercentage || 0) > (rounded[maxIdx]?.slicePercentage || 0)) {
      maxIdx = i;
    }
  }

  rounded[maxIdx] = {
    ...rounded[maxIdx],
    slicePercentage: roundToTwo(
      Math.max(0, Number(rounded[maxIdx]?.slicePercentage || 0) + delta)
    )
  };

  return rounded;
}

function normalizeComparativeMetric(rawMetric) {
      const metric = String(rawMetric || '').trim().toLowerCase();
      const supported = new Set([
        'completionpercentage',
        'totalachievement',
        'totalentries',
        'efficiencyscore',
        'totaltarget'
      ]);
      if (supported.has(metric)) return metric;
      return 'completionpercentage';
}

    function normalizeComparativeSortOrder(rawOrder) {
      const order = String(rawOrder || '').trim().toLowerCase();
      if (order === 'bottom') return 'bottom';
      return 'top';
    }

    function normalizeTimeRange(rawRange) {
      const value = String(rawRange || '').trim().toLowerCase();
      if (value === 'quarter') return 'quarter';
      if (value === 'year') return 'year';
      return 'month';
    }

    function toYearMonthLabel(year, month) {
      if (!year || !month) return '';
      return `${String(month).padStart(2, '0')}/${year}`;
    }

    function quarterForMonth(month) {
      const m = Number(month || 1);
      if (m >= 6 && m <= 8) return 1;
      if (m >= 9 && m <= 11) return 2;
      if (m === 12 || m === 1 || m === 2) return 3;
      return 4;
    }

    function fiscalYearStartForMonth(year, month) {
      const y = Number(year || 0);
      const m = Number(month || 1);
      if (!Number.isFinite(y)) return null;
      return m >= 6 ? y : y - 1;
    }

    function quarterBounds(fiscalYearStart, quarter) {
      const fy = Number(fiscalYearStart || 0);
      const q = Number(quarter || 1);

      if (q === 1) {
        return {
          fiscalYearStart: fy,
          quarter: q,
          periods: [
            { year: fy, month: 6 },
            { year: fy, month: 7 },
            { year: fy, month: 8 }
          ],
          label: `Q1 (Jun-Aug) FY ${fy}-${String(fy + 1).slice(-2)}`
        };
      }

      if (q === 2) {
        return {
          fiscalYearStart: fy,
          quarter: q,
          periods: [
            { year: fy, month: 9 },
            { year: fy, month: 10 },
            { year: fy, month: 11 }
          ],
          label: `Q2 (Sep-Nov) FY ${fy}-${String(fy + 1).slice(-2)}`
        };
      }

      if (q === 3) {
        return {
          fiscalYearStart: fy,
          quarter: q,
          periods: [
            { year: fy, month: 12 },
            { year: fy + 1, month: 1 },
            { year: fy + 1, month: 2 }
          ],
          label: `Q3 (Dec-Feb) FY ${fy}-${String(fy + 1).slice(-2)}`
        };
      }

      return {
        fiscalYearStart: fy,
        quarter: 4,
        periods: [
          { year: fy + 1, month: 3 },
          { year: fy + 1, month: 4 },
          { year: fy + 1, month: 5 }
        ],
        label: `Q4 (Mar-May) FY ${fy}-${String(fy + 1).slice(-2)}`
      };
    }

    function previousQuarterBounds(fiscalYearStart, quarter) {
      if (quarter > 1) return quarterBounds(fiscalYearStart, quarter - 1);
      return quarterBounds(fiscalYearStart - 1, 4);
    }

    function comparativeMetricValue(row, metric) {
      const completion = Number(row?.completionPercentage || 0);
      const achievement = Number(row?.totalAchievement || 0);
      const entries = Number(row?.totalEntries || 0);
      const efficiency = Number(row?.efficiencyScore || 0);
      const target = Number(row?.totalTarget || 0);

      if (metric === 'totalachievement') return achievement;
      if (metric === 'totalentries') return entries;
      if (metric === 'efficiencyscore') return efficiency;
      if (metric === 'totaltarget') return target;
      return completion;
    }

    function buildComparativeRange({
      baseMatch,
      anchor,
      timeRange,
      quarter,
      quarterYear,
      hasExplicitPeriod = false
    }) {
      const range = normalizeTimeRange(timeRange);

      if (!anchor?.year || !anchor?.month) {
        return {
          currentMatch: baseMatch,
          previousMatch: baseMatch,
          currentLabel: '',
          previousLabel: ''
        };
      }

      if (range === 'year') {
        if (!hasExplicitPeriod) {
          return {
            currentMatch: { ...baseMatch },
            previousMatch: null,
            currentLabel: 'All Years',
            previousLabel: ''
          };
        }

        const currentYear = Number(anchor.year);
        const previousYear = currentYear - 1;
        return {
          currentMatch: { ...baseMatch, achievementYear: currentYear },
          previousMatch: { ...baseMatch, achievementYear: previousYear },
          currentLabel: String(currentYear),
          previousLabel: String(previousYear)
        };
      }

      if (range === 'quarter') {
        const explicitQuarter = Number(quarter || 0);
        const hasExplicitQuarter = Number.isFinite(explicitQuarter) && explicitQuarter >= 1 && explicitQuarter <= 4;

        const currentFiscalYearStart = hasExplicitQuarter
          ? Number(quarterYear || fiscalYearStartForMonth(anchor.year, anchor.month))
          : fiscalYearStartForMonth(anchor.year, anchor.month);

        const currentQuarterNumber = hasExplicitQuarter
          ? explicitQuarter
          : quarterForMonth(anchor.month);

        const currentQuarter = quarterBounds(currentFiscalYearStart, currentQuarterNumber);
        const previousQuarter = previousQuarterBounds(currentQuarter.fiscalYearStart, currentQuarter.quarter);

        const currentPeriods = Array.isArray(currentQuarter.periods) ? currentQuarter.periods : [];
        const previousPeriods = Array.isArray(previousQuarter.periods) ? previousQuarter.periods : [];

        return {
          currentMatch: {
            ...baseMatch,
            $or: currentPeriods.map((p) => ({
              achievementYear: p.year,
              achievementMonth: p.month
            }))
          },
          previousMatch: {
            ...baseMatch,
            $or: previousPeriods.map((p) => ({
              achievementYear: p.year,
              achievementMonth: p.month
            }))
          },
          currentLabel: currentQuarter.label,
          previousLabel: previousQuarter.label
        };
      }

      const prev = previousPeriod(anchor);
      return {
        currentMatch: {
          ...baseMatch,
          achievementYear: anchor.year,
          achievementMonth: anchor.month
        },
        previousMatch: prev
          ? {
              ...baseMatch,
              achievementYear: prev.year,
              achievementMonth: prev.month
            }
          : baseMatch,
        currentLabel: toYearMonthLabel(anchor.year, anchor.month),
        previousLabel: prev ? toYearMonthLabel(prev.year, prev.month) : ''
      };
    }

    async function aggregateComparativeRows({ match, grouping, kraId }) {
      if (grouping?.groupBy === 'all') {
        const corpRows = await KraMonthlyEntry.aggregate([
          { $match: match },
          { $match: { corporation: { $ne: null } } },
          ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
          {
            $group: {
              _id: '$corporation',
              totalAchievement: { $sum: achievementExpr() },
              totalTarget: { $sum: targetExpr() },
              submissionIds: { $addToSet: '$_id' }
            }
          },
          {
            $addFields: {
              completionPercentage: percentageProject({
                achievementField: '$totalAchievement',
                targetField: '$totalTarget'
              }),
              totalEntries: { $size: '$submissionIds' }
            }
          }
        ]);

        if (!corpRows.length) {
          return [
            {
              _id: 'all',
              name: 'All Corporations (Average)',
              totalAchievement: 0,
              totalTarget: 0,
              totalEntries: 0,
              completionPercentage: 0,
              efficiencyScore: 0
            }
          ];
        }

        const totalAchievement = corpRows.reduce(
          (sum, row) => sum + Number(row?.totalAchievement || 0),
          0
        );
        const totalTarget = corpRows.reduce(
          (sum, row) => sum + Number(row?.totalTarget || 0),
          0
        );
        const totalEntries = corpRows.reduce(
          (sum, row) => sum + Number(row?.totalEntries || 0),
          0
        );
        const completionPercentage =
          corpRows.reduce(
            (sum, row) => sum + Number(row?.completionPercentage || 0),
            0
          ) / corpRows.length;

        return [
          {
            _id: 'all',
            name: 'All Corporations (Average)',
            totalAchievement: Math.round(totalAchievement * 100) / 100,
            totalTarget: Math.round(totalTarget * 100) / 100,
            totalEntries,
            completionPercentage: Math.round(completionPercentage * 100) / 100,
            efficiencyScore: 0
          }
        ];
      }

      const rawRows = await KraMonthlyEntry.aggregate([
        { $match: match },
        ...getEntityPresenceMatchStage(grouping),
        ...buildKraUnwindPipeline({ baseMatch: {}, kraId }),
        {
          $addFields: {
            _rowEfficiency: {
              $cond: {
                if: { $gt: [targetExpr(), 0] },
                then: {
                  $multiply: [
                    { $divide: [achievementExpr(), targetExpr()] },
                    { $ifNull: ['$kras.weight', 0] },
                    100
                  ]
                },
                else: 0
              }
            }
          }
        },
        {
          $group: {
            _id: grouping.idField,
            snapshotName: { $first: `$${grouping.snapshotNameField}` },
            totalAchievement: { $sum: achievementExpr() },
            totalTarget: { $sum: targetExpr() },
            weightedScore: { $sum: '$_rowEfficiency' },
            totalWeight: { $sum: { $ifNull: ['$kras.weight', 0] } },
            submissionIds: { $addToSet: '$_id' }
          }
        },
        { $match: { _id: { $ne: null } } },
        {
          $addFields: {
            completionPercentage: percentageProject({
              achievementField: '$totalAchievement',
              targetField: '$totalTarget'
            }),
            efficiencyScore: {
              $cond: {
                if: { $gt: ['$totalWeight', 0] },
                then: { $round: [{ $divide: ['$weightedScore', '$totalWeight'] }, 2] },
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
            totalAchievement: { $round: ['$totalAchievement', 2] },
            totalTarget: { $round: ['$totalTarget', 2] },
            totalEntries: { $size: '$submissionIds' },
            completionPercentage: 1,
            efficiencyScore: 1
          }
        }
      ]);

      const scopedEntities = await getScopedEntitiesForGrouping(grouping, match);
      if (!Array.isArray(scopedEntities) || scopedEntities.length === 0) {
        return rawRows;
      }

      const byId = new Map(
        (Array.isArray(rawRows) ? rawRows : []).map((row) => [String(row?._id || ''), row])
      );

      return scopedEntities
        .map((entity) => {
          const id = String(entity?._id || '');
          if (!id) return null;
          const existing = byId.get(id);
          if (existing) {
            return {
              ...existing,
              _id: entity._id,
              name: String(existing?.name || '').trim() || String(entity?.name || '').trim() || 'Unknown'
            };
          }

          return {
            _id: entity._id,
            name: String(entity?.name || '').trim() || 'Unknown',
            totalAchievement: 0,
            totalTarget: 0,
            totalEntries: 0,
            completionPercentage: 0,
            efficiencyScore: 0
          };
        })
        .filter(Boolean);
    }

    // GET comparative analysis data for leaderboard insights
    router.get('/comparative-analysis', async (req, res) => {
      try {
        const baseMatch = buildBaseMatch(req.query);
        const kraId = await resolveKraIdParam(req.query.kra);

        const level = String(req.query.level || req.query.groupBy || 'corporation').toLowerCase();
        const grouping = getGrouping({ groupBy: level });
        const metric = normalizeComparativeMetric(req.query.metric);
        const timeRange = normalizeTimeRange(req.query.timeRange);
        const sortOrder = normalizeComparativeSortOrder(req.query.sortOrder);

        const topNRaw = String(req.query.topN || '').trim().toLowerCase();
        const isAllTopN = topNRaw === 'all';
        const parsedTopN = Math.min(Math.max(toInt(req.query.topN) || 5, 1), 50);
        const topN = isAllTopN ? null : parsedTopN;

        const requestedPage = toInt(req.query.page);
        const page = Math.max(requestedPage || 1, 1);
        const requestedLimit = toInt(req.query.limit);
        const hasRequestedLimit = Number.isFinite(requestedLimit);
        const perPage = Math.min(
          Math.max(hasRequestedLimit ? requestedLimit : parsedTopN, 1),
          100
        );

        const hasExplicitPeriod =
          Number.isFinite(toInt(req.query.month)) &&
          Number.isFinite(toInt(req.query.year));

        const anchor = await resolveEffectivePeriod({
          baseMatch,
          month: req.query.month,
          year: req.query.year,
          preferLatest: true
        });

        if (!anchor) {
          return res.json({
            success: true,
            data: {
              level: grouping.groupBy,
              metric,
              timeRange,
              period: null,
              topPerformers: [],
              leaderboard: [],
              totalCount: 0,
              risingPerformer: null,
              needsAttention: null
            }
          });
        }

        const range = buildComparativeRange({
          baseMatch,
          anchor,
          timeRange,
          quarter: req.query.quarter,
          quarterYear: req.query.year,
          hasExplicitPeriod
        });

        const [currentRowsRaw, previousRowsRaw] = await Promise.all([
          aggregateComparativeRows({
            match: range.currentMatch,
            grouping,
            kraId
          }),
          range.previousMatch
            ? aggregateComparativeRows({
                match: range.previousMatch,
                grouping,
                kraId
              })
            : Promise.resolve([])
        ]);

        const currentRows = await backfillCorporationNamesFromDivisionSnapshots(currentRowsRaw, grouping);
        const previousRows = await backfillCorporationNamesFromDivisionSnapshots(previousRowsRaw, grouping);

        const prevById = new Map(
          previousRows.map((row) => [String(row?._id || ''), comparativeMetricValue(row, metric)])
        );

        const prevRankMap = new Map(
          [...previousRows]
            .sort((a, b) => {
              const aVal = comparativeMetricValue(a, metric);
              const bVal = comparativeMetricValue(b, metric);
              if (bVal !== aVal) return bVal - aVal;
              return String(a?.name || '').localeCompare(String(b?.name || ''));
            })
            .map((row, idx) => [String(row?._id || ''), idx + 1])
        );

        const rankedRows = [...currentRows]
          .map((row) => {
            const entityId = String(row?._id || '');
            const metricValue = comparativeMetricValue(row, metric);
            const previousMetricValue = Number(prevById.get(entityId) || 0);
            return {
              entityId,
              name: String(row?.name || 'Unknown'),
              totalAchievement: Number(row?.totalAchievement || 0),
              totalTarget: Number(row?.totalTarget || 0),
              totalEntries: Number(row?.totalEntries || 0),
              completionPercentage: Number(row?.completionPercentage || 0),
              efficiencyScore: Number(row?.efficiencyScore || 0),
              metricValue: Number(metricValue || 0),
              previousMetricValue,
              metricDelta: Number(metricValue || 0) - previousMetricValue
            };
          })
          .sort((a, b) => {
            if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
            return String(a.name).localeCompare(String(b.name));
          })
          .map((row, idx) => {
            const rank = idx + 1;
            const previousRank = prevRankMap.get(row.entityId) || null;
            const rankChange = previousRank ? previousRank - rank : null;
            const trendDirection =
              row.metricDelta > 0 ? 'up' : row.metricDelta < 0 ? 'down' : 'flat';

            return {
              ...row,
              rank,
              previousRank,
              rankChange,
              trendDirection
            };
          });

        const orderedRows = sortOrder === 'bottom'
          ? [...rankedRows].sort((a, b) => {
              if (a.metricValue !== b.metricValue) return a.metricValue - b.metricValue;
              return String(a.name).localeCompare(String(b.name));
            })
          : rankedRows;

        const finalRankedRows = orderedRows.map((row, idx) => ({
          ...row,
          rank: idx + 1
        }));

        const useFullLeaderboard = isAllTopN && !hasRequestedLimit;
        const resolvedPage = useFullLeaderboard ? 1 : page;
        const resolvedPerPage = useFullLeaderboard
          ? Math.max(finalRankedRows.length, 1)
          : perPage;

        const start = (resolvedPage - 1) * resolvedPerPage;
        const leaderboard = useFullLeaderboard
          ? finalRankedRows
          : finalRankedRows.slice(start, start + resolvedPerPage);
        const topPerformers = isAllTopN
          ? finalRankedRows
          : finalRankedRows.slice(0, topN);

        const risingPerformer =
          [...rankedRows]
            .sort((a, b) => b.metricDelta - a.metricDelta)
            .find((row) => row.metricDelta > 0) || null;

        const needsAttention = rankedRows.length > 0 ? rankedRows[rankedRows.length - 1] : null;

        res.json({
          success: true,
          data: {
            level: grouping.groupBy,
            metric,
            timeRange,
            sortOrder,
            period: {
              anchor,
              currentLabel: range.currentLabel,
              previousLabel: range.previousLabel
            },
            topN: isAllTopN ? finalRankedRows.length : topN,
            page: resolvedPage,
            perPage: resolvedPerPage,
            totalCount: finalRankedRows.length,
            topPerformers,
            leaderboard,
            risingPerformer,
            needsAttention
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Error fetching comparative analysis',
          error: error.message
        });
      }
    });

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
    const regionId = toObjectId(req.query.region);
    const circleId = toObjectId(req.query.circle);
    const divisionId = toObjectId(req.query.division);

    if (corporationId) match.corporation = corporationId;
    if (regionId) match.region = regionId;
    if (circleId) match.circle = circleId;
    if (divisionId) match.division = divisionId;

    if (req.query.kraYear) {
      const variants = expandKraYearVariants(req.query.kraYear);
      match.kraYear = variants.length > 1 ? { $in: variants } : variants[0];
    }

    // Keep pie grouping behavior aligned with bar chart drill-down.
    // No corporation selected -> corporation-wise
    // Corporation selected -> region-wise
    // Region selected -> circle-wise
    // Circle selected -> division-wise
    let hierarchyLevel = 'corporation';
    if (corporationId && !regionId) hierarchyLevel = 'region';
    if (regionId && !circleId) hierarchyLevel = 'circle';
    if (circleId || divisionId) hierarchyLevel = 'division';

    const hierarchyCollection = hierarchyLevel === 'division'
      ? 'divisions'
      : hierarchyLevel === 'circle'
        ? 'circles'
        : hierarchyLevel === 'region'
          ? 'regions'
          : 'corporations';

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
          _id: { entity: `$${hierarchyLevel}`, kraId: '$kras.kraId' },
          kraName: { $first: '$kras.kraName' },
          weight: { $max: { $ifNull: ['$kras.weight', 0] } },
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
        $addFields: {
          score: { $multiply: ['$achievementPercentage', '$weight'] }
        }
      },
      {
        $group: {
          _id: '$_id.entity',
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
          from: hierarchyCollection,
          localField: '_id',
          foreignField: '_id',
          as: 'entity'
        }
      },
      {
        $project: {
          _id: 0,
          corporationId: '$_id',
          corporationName: { $arrayElemAt: ['$entity.name', 0] },
          corporationCode: { $ifNull: [{ $arrayElemAt: ['$entity.code', 0] }, ''] },
          hierarchyLevel: hierarchyLevel,
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
      { $sort: { corporationCode: 1, corporationName: 1 } }
    ]);

    const normalizedData = data.map((row) => ({
      ...row,
      data: normalizeSlicePercentages(row?.data)
    }));

    res.json({ success: true, period, data: normalizedData });
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
