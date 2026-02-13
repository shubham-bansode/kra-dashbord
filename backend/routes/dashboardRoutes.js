const express = require('express');
const router = express.Router();
const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const mongoose = require('mongoose');
const Kra = require('../models/Kra');

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

// GET dashboard summary statistics
router.get('/summary', async (req, res) => {
  try {
    const { corporation, kraYear, startDate, endDate, kra } = req.query;
    
    // Build filter
    const filter = {};
    if (corporation) filter.corporation = corporation;
    if (kraYear) filter.kraYear = kraYear;
    if (startDate || endDate) {
      filter.achievementDate = {};
      if (startDate) filter.achievementDate.$gte = new Date(startDate);
      if (endDate) filter.achievementDate.$lte = new Date(endDate);
    }

    // Get total entries
    const totalEntries = await KraMonthlyEntry.countDocuments(filter);

    // Get sum of achievements and targets across all KRAs
    const kraId = await resolveKraIdParam(kra);
    const pipeline = [{ $match: filter }, { $unwind: '$kras' }];
    if (kraId) pipeline.push({ $match: { 'kras.kraId': kraId } });

    const aggregation = await KraMonthlyEntry.aggregate([
      ...pipeline,
      {
        $group: {
          _id: null,
          totalAchievement: { $sum: '$kras.kraAchievement' },
          totalTarget: { $sum: '$kras.annualTarget' },
          avgAchievement: { $avg: '$kras.kraAchievement' },
          avgTarget: { $avg: '$kras.annualTarget' }
        }
      }
    ]);

    const stats = aggregation[0] || {
      totalAchievement: 0,
      totalTarget: 0,
      avgAchievement: 0,
      avgTarget: 0
    };

    res.json({
      success: true,
      data: {
        totalEntries,
        totalAchievement: Math.round(stats.totalAchievement * 100) / 100,
        totalTarget: Math.round(stats.totalTarget * 100) / 100,
        avgAchievement: Math.round(stats.avgAchievement * 100) / 100,
        avgTarget: Math.round(stats.avgTarget * 100) / 100,
        achievementPercentage: stats.totalTarget > 0 
          ? Math.round((stats.totalAchievement / stats.totalTarget) * 100 * 100) / 100 
          : 0
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
    const { kraYear, startDate, endDate, kra } = req.query;
    
    const filter = {};
    if (kraYear) filter.kraYear = kraYear;
    if (startDate || endDate) {
      filter.achievementDate = {};
      if (startDate) filter.achievementDate.$gte = new Date(startDate);
      if (endDate) filter.achievementDate.$lte = new Date(endDate);
    }

    const kraId = await resolveKraIdParam(kra);
    const pipeline = [{ $match: filter }, { $unwind: '$kras' }];
    if (kraId) pipeline.push({ $match: { 'kras.kraId': kraId } });

    const data = await KraMonthlyEntry.aggregate([
      ...pipeline,
      {
        $group: {
          _id: '$corporation',
          totalAchievement: { $sum: '$kras.kraAchievement' },
          totalTarget: { $sum: '$kras.annualTarget' },
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
    const { corporation, kraYear, startDate, endDate, kra } = req.query;
    
    const filter = {};
    if (corporation) filter.corporation = corporation;
    if (kraYear) filter.kraYear = kraYear;
    if (startDate || endDate) {
      filter.achievementDate = {};
      if (startDate) filter.achievementDate.$gte = new Date(startDate);
      if (endDate) filter.achievementDate.$lte = new Date(endDate);
    }

    const kraId = await resolveKraIdParam(kra);
    const pipeline = [{ $match: filter }, { $unwind: '$kras' }];
    if (kraId) pipeline.push({ $match: { 'kras.kraId': kraId } });

    const data = await KraMonthlyEntry.aggregate([
      ...pipeline,
      {
        $group: {
          _id: '$kras.kraId',
          kraName: { $first: '$kras.kraName' },
          weight: { $first: '$kras.weight' },
          totalAchievement: { $sum: '$kras.kraAchievement' },
          totalTarget: { $sum: '$kras.annualTarget' },
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
    const { corporation, kraYear, kraId, kra } = req.query;
    
    const filter = {};
    if (corporation) filter.corporation = corporation;
    if (kraYear) filter.kraYear = kraYear;
    const resolvedKraId = await resolveKraIdParam(kraId || kra);
    const pipeline = [{ $match: filter }, { $unwind: '$kras' }];
    if (resolvedKraId) pipeline.push({ $match: { 'kras.kraId': resolvedKraId } });

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

module.exports = router;
