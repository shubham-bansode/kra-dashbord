const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { body, validationResult, param, query } = require('express-validator');
const { adminAuth, superadminAuth } = require('../middleware/adminAuth');
const auth = require('../middleware/auth');

// Models
const FinancialYear = require('../models/FinancialYear');
const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const User = require('../models/User');
const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Kra = require('../models/Kra');
const { getAllKras } = require('../config/kraMaster');

// ==========================================
// FINANCIAL YEAR MANAGEMENT
// ==========================================

// GET /api/admin/financial-years - Get all financial years
router.get('/financial-years', adminAuth, async (req, res) => {
  try {
    const years = await FinancialYear.find()
      .sort({ startDate: -1 })
      .populate('createdBy', 'fullName');
    
    res.json({
      success: true,
      data: years
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching financial years',
      error: error.message
    });
  }
});

// GET /api/admin/financial-years/active - Get active financial year (public)
router.get('/financial-years/active', async (req, res) => {
  try {
    const activeYear = await FinancialYear.getActive();
    
    if (!activeYear) {
      return res.status(404).json({
        success: false,
        message: 'No active financial year configured'
      });
    }
    
    res.json({
      success: true,
      data: activeYear
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching active financial year',
      error: error.message
    });
  }
});

// POST /api/admin/financial-years - Create new financial year
router.post('/financial-years', 
  adminAuth,
  [
    body('year')
      .notEmpty().withMessage('Year is required')
      .matches(/^\d{4}[-–]\d{2}$/).withMessage('Year must be in format YYYY-YY (e.g., 2024-25)'),
    body('isActive').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { year, isActive } = req.body;
      
      // Check if year already exists
      const existing = await FinancialYear.findOne({ year: year.replace('–', '-') });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Financial year already exists'
        });
      }

      // Generate year data
      const yearData = FinancialYear.generateFromYear(year.replace('–', '-'));
      if (!yearData) {
        return res.status(400).json({
          success: false,
          message: 'Invalid year format'
        });
      }

      const newYear = await FinancialYear.create({
        ...yearData,
        isActive: isActive || false,
        createdBy: req.user.userId
      });

      res.status(201).json({
        success: true,
        message: 'Financial year created successfully',
        data: newYear
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating financial year',
        error: error.message
      });
    }
  }
);

// PUT /api/admin/financial-years/:id - Update financial year
router.put('/financial-years/:id',
  adminAuth,
  [
    param('id').isMongoId().withMessage('Invalid ID'),
    body('isActive').optional().isBoolean(),
    body('isLocked').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updates = {};
      
      if (typeof req.body.isActive === 'boolean') {
        updates.isActive = req.body.isActive;
        
        // If setting this year as active, deactivate all other years and lock them
        if (req.body.isActive === true) {
          await FinancialYear.updateMany(
            { _id: { $ne: id } },
            { isActive: false, isLocked: true }
          );
          // Also unlock the year being activated
          updates.isLocked = false;
        }
      }
      if (typeof req.body.isLocked === 'boolean') {
        updates.isLocked = req.body.isLocked;
      }

      const year = await FinancialYear.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      );

      if (!year) {
        return res.status(404).json({
          success: false,
          message: 'Financial year not found'
        });
      }

      res.json({
        success: true,
        message: 'Financial year updated successfully',
        data: year
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating financial year',
        error: error.message
      });
    }
  }
);

// DELETE /api/admin/financial-years/:id - Delete financial year
router.delete('/financial-years/:id',
  adminAuth,
  [param('id').isMongoId().withMessage('Invalid ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      
      // Check if there are entries using this year
      const year = await FinancialYear.findById(id);
      if (!year) {
        return res.status(404).json({
          success: false,
          message: 'Financial year not found'
        });
      }

      const entriesCount = await KraMonthlyEntry.countDocuments({ kraYear: year.year });
      if (entriesCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete: ${entriesCount} entries exist for this financial year`
        });
      }

      await FinancialYear.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Financial year deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting financial year',
        error: error.message
      });
    }
  }
);

// ==========================================
// KRA ENTRIES MANAGEMENT
// ==========================================

// GET /api/admin/entries - Get all entries with pagination & filters
router.get('/entries',
  adminAuth,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        corporation,
        region,
        circle,
        kraYear,
        kra,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filter = {};
      
      if (corporation) filter.corporation = corporation;
      if (region) filter.region = region;
      if (circle) filter.circle = circle;
      if (kraYear) filter.kraYear = kraYear;
      // Back-compat: frontend uses query param "kra". In config-based schema, we filter by kraId.
      if (kra) {
        let kraId = parseInt(kra, 10);
        if (Number.isNaN(kraId) && mongoose.isValidObjectId(kra)) {
          const kraDoc = await Kra.findById(kra).select('kraNumber');
          if (kraDoc?.kraNumber) kraId = kraDoc.kraNumber;
        }
        if (!Number.isNaN(kraId)) {
          filter.kras = { $elemMatch: { kraId } };
        }
      }
      
      if (search) {
        filter.$or = [
          { submittedBy: { $regex: search, $options: 'i' } },
          { contactNumber: { $regex: search, $options: 'i' } },
          { remarks: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [entries, total] = await Promise.all([
        KraMonthlyEntry.find(filter)
          .populate('corporation', 'name code')
          .populate('region', 'name')
          .populate('circle', 'name')
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit)),
        KraMonthlyEntry.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          entries,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching entries',
        error: error.message
      });
    }
  }
);

// GET /api/admin/entries/:id - Get single entry
router.get('/entries/:id',
  adminAuth,
  [param('id').isMongoId().withMessage('Invalid ID')],
  async (req, res) => {
    try {
      const entry = await KraMonthlyEntry.findById(req.params.id)
        .populate('corporation', 'name code')
        .populate('region', 'name')
        .populate('circle', 'name');

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Entry not found'
        });
      }

      res.json({
        success: true,
        data: entry
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching entry',
        error: error.message
      });
    }
  }
);

// POST /api/admin/entries - Create new entry (admin)
router.post('/entries',
  adminAuth,
  [
    body('corporation').notEmpty().isMongoId(),
    body('kraYear').notEmpty(),
    body('achievementDate').notEmpty().isISO8601(),
    body('contactNumber').notEmpty().matches(/^[6-9]\d{9}$/),
    body('kras').optional().isArray()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const baseKras = getAllKras(req.body.kraYear);
      const requestKras = Array.isArray(req.body.kras) ? req.body.kras : [];
      const requestMap = new Map(requestKras.map((k) => [Number(k.kraId), k]));

      const kras = baseKras.map((k) => {
        const reqK = requestMap.get(k.kraId);
        const annualTarget = reqK ? Number(reqK.annualTarget) : 0;
        const kraAchievement = reqK ? Number(reqK.kraAchievement) : 0;
        return {
          kraId: k.kraId,
          kraName: k.kraName,
          weight: k.weight,
          annualTarget: Number.isFinite(annualTarget) ? Math.max(0, annualTarget) : 0,
          kraAchievement: Number.isFinite(kraAchievement) ? Math.max(0, kraAchievement) : 0
        };
      });

      const selectedKraIds = kras
        .filter((k) => (k.annualTarget || 0) > 0 || (k.kraAchievement || 0) > 0)
        .map((k) => k.kraId);

      const duplicate = await KraMonthlyEntry.checkDuplicate({
        corporation: req.body.corporation,
        region: req.body.region || null,
        circle: req.body.circle || null,
        achievementDate: req.body.achievementDate
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'Duplicate entry exists for this month'
        });
      }

      const entry = await KraMonthlyEntry.create({
        corporation: req.body.corporation,
        region: req.body.region || null,
        circle: req.body.circle || null,
        kraYear: req.body.kraYear,
        achievementDate: req.body.achievementDate,
        kras,
        selectedKraIds,
        contactNumber: req.body.contactNumber,
        remarks: req.body.remarks || '',
        submittedBy: `Admin: ${req.user.fullName}`,
        submittedAt: new Date()
      });
      
      const populated = await KraMonthlyEntry.findById(entry._id)
        .populate('corporation', 'name code')
        .populate('region', 'name')
        .populate('circle', 'name');

      res.status(201).json({
        success: true,
        message: 'Entry created successfully',
        data: populated
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Duplicate entry exists for this KRA and month'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error creating entry',
        error: error.message
      });
    }
  }
);

// PUT /api/admin/entries/:id - Update entry
router.put('/entries/:id',
  adminAuth,
  [param('id').isMongoId().withMessage('Invalid ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updates = { ...req.body };

      delete updates._id;
      delete updates.createdAt;
      delete updates.updatedAt;

      const baseKras = getAllKras(updates.kraYear);
      const requestKras = Array.isArray(updates.kras) ? updates.kras : [];
      const requestMap = new Map(requestKras.map((k) => [Number(k.kraId), k]));

      const kras = baseKras.map((k) => {
        const reqK = requestMap.get(k.kraId);
        const annualTarget = reqK ? Number(reqK.annualTarget) : 0;
        const kraAchievement = reqK ? Number(reqK.kraAchievement) : 0;
        return {
          kraId: k.kraId,
          kraName: k.kraName,
          weight: k.weight,
          annualTarget: Number.isFinite(annualTarget) ? Math.max(0, annualTarget) : 0,
          kraAchievement: Number.isFinite(kraAchievement) ? Math.max(0, kraAchievement) : 0
        };
      });

      const selectedKraIds = kras
        .filter((k) => (k.annualTarget || 0) > 0 || (k.kraAchievement || 0) > 0)
        .map((k) => k.kraId);

      const updatePayload = {
        corporation: updates.corporation,
        region: updates.region || null,
        circle: updates.circle || null,
        kraYear: updates.kraYear,
        achievementDate: updates.achievementDate,
        kras,
        selectedKraIds,
        contactNumber: updates.contactNumber,
        remarks: updates.remarks || '',
        submittedBy: updates.submittedBy || `Admin: ${req.user.fullName}`
      };

      const entry = await KraMonthlyEntry.findByIdAndUpdate(
        id,
        updatePayload,
        { new: true, runValidators: true }
      )
        .populate('corporation', 'name code')
        .populate('region', 'name')
        .populate('circle', 'name');

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Entry not found'
        });
      }

      res.json({
        success: true,
        message: 'Entry updated successfully',
        data: entry
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating entry',
        error: error.message
      });
    }
  }
);

// DELETE /api/admin/entries/:id - Delete entry
router.delete('/entries/:id',
  adminAuth,
  [param('id').isMongoId().withMessage('Invalid ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const entry = await KraMonthlyEntry.findByIdAndDelete(req.params.id);

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Entry not found'
        });
      }

      res.json({
        success: true,
        message: 'Entry deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting entry',
        error: error.message
      });
    }
  }
);

// DELETE /api/admin/entries - Bulk delete entries
router.delete('/entries',
  adminAuth,
  [body('ids').isArray().withMessage('IDs array is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { ids } = req.body;
      const result = await KraMonthlyEntry.deleteMany({ _id: { $in: ids } });

      res.json({
        success: true,
        message: `${result.deletedCount} entries deleted successfully`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting entries',
        error: error.message
      });
    }
  }
);

// POST /api/admin/entries/wipe - DANGER: Delete ALL KRA entry submissions
router.post('/entries/wipe',
  superadminAuth,
  [body('confirm').equals('DELETE_KRA_ENTRIES').withMessage('Invalid confirmation')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const result = await KraMonthlyEntry.deleteMany({});

      res.json({
        success: true,
        message: `Deleted ${result.deletedCount} KRA entry submissions`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error wiping entries',
        error: error.message
      });
    }
  }
);

// ==========================================
// USER MANAGEMENT
// ==========================================

// GET /api/admin/users - Get all users
router.get('/users',
  adminAuth,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, search, role, isActive } = req.query;
      
      const filter = {};
      if (role) filter.role = role;
      if (typeof isActive !== 'undefined') filter.isActive = isActive === 'true';
      if (search) {
        filter.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { mobileNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [users, total] = await Promise.all([
        User.find(filter)
          .select('-passwordHash')
          .populate('corporation', 'name code')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        User.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching users',
        error: error.message
      });
    }
  }
);

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role',
  superadminAuth,
  [
    param('id').isMongoId(),
    body('role').isIn(['user', 'admin', 'superadmin'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role: req.body.role },
        { new: true }
      ).select('-passwordHash').populate('corporation', 'name code');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User role updated successfully',
        data: user
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating user role',
        error: error.message
      });
    }
  }
);

// PUT /api/admin/users/:id/status - Toggle user active status
router.put('/users/:id/status',
  adminAuth,
  [param('id').isMongoId()],
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      user.isActive = !user.isActive;
      await user.save();

      res.json({
        success: true,
        message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
        data: { isActive: user.isActive }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating user status',
        error: error.message
      });
    }
  }
);

// ==========================================
// STATISTICS & OVERVIEW
// ==========================================

// GET /api/admin/stats - Get admin dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [
      totalEntries,
      totalUsers,
      totalCorporations,
      activeYear,
      recentEntries,
      entriesByMonth,
      entriesByCorporation
    ] = await Promise.all([
      KraMonthlyEntry.countDocuments(),
      User.countDocuments({ isActive: true }),
      Corporation.countDocuments(),
      FinancialYear.getActive(),
      KraMonthlyEntry.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('corporation', 'name code'),
      KraMonthlyEntry.aggregate([
        {
          $group: {
            _id: { month: '$achievementMonth', year: '$achievementYear' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]),
      KraMonthlyEntry.aggregate([
        {
          $lookup: {
            from: 'corporations',
            localField: 'corporation',
            foreignField: '_id',
            as: 'corp'
          }
        },
        { $unwind: { path: '$corp', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$corp.code',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalEntries,
        totalUsers,
        totalCorporations,
        activeFinancialYear: activeYear?.year || 'Not Set',
        recentEntries,
        entriesByMonth,
        entriesByCorporation
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

// ==========================================
// DROPDOWN DATA (for forms)
// ==========================================

// GET /api/admin/dropdown-data - Get all dropdown data for forms
router.get('/dropdown-data', adminAuth, async (req, res) => {
  try {
    const [corporations, regions, circles, kras, financialYears] = await Promise.all([
      Corporation.find().select('name code hasRegions').sort('name'),
      Region.find().populate('corporation', 'name code').sort('name'),
      Circle.find().populate('region', 'name').sort('name'),
      Kra.find().sort('kraNumber'),
      FinancialYear.find().sort({ startDate: -1 })
    ]);

    res.json({
      success: true,
      data: {
        corporations,
        regions,
        circles,
        kras,
        financialYears
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dropdown data',
      error: error.message
    });
  }
});

module.exports = router;
