const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { body, validationResult, param, query } = require('express-validator');
const bcrypt = require('bcryptjs');
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
const { getAllKrasAsync } = require('../config/kraMaster');
const {
  getAllowedCorporationNames,
  isAllowedRegionName,
  isAllowedCircleName
} = require('../config/googleFormHierarchy');

const isSuperAdmin = (req) => String(req?.user?.role || '') === 'superadmin';

const scopedCorporationId = (req) => {
  if (isSuperAdmin(req)) return null;
  const corp = req?.user?.corporation;
  return corp ? String(corp) : null;
};

const applyCorporationScope = (req, filter, field = 'corporation') => {
  const corpId = scopedCorporationId(req);
  if (!corpId) return;
  filter[field] = new mongoose.Types.ObjectId(corpId);
};

const hasCorpAccess = (req, corpId) => {
  if (isSuperAdmin(req)) return true;
  const scoped = scopedCorporationId(req);
  return Boolean(scoped) && String(scoped) === String(corpId || '');
};

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

      if (!isSuperAdmin(req) && !hasCorpAccess(req, req.body.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can create entries only for your corporation'
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
        division,
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
      if (division) filter.division = division;
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

      // Non-superadmins can only access their own corporation data.
      applyCorporationScope(req, filter);

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [entries, total] = await Promise.all([
        KraMonthlyEntry.find(filter)
          .populate('corporation', 'name code')
          .populate('region', 'name')
          .populate('circle', 'name')
          .populate('division', 'name')
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
        .populate('circle', 'name')
        .populate('division', 'name');

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Entry not found'
        });
      }

      if (!hasCorpAccess(req, entry.corporation?._id || entry.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can access only your corporation hierarchy'
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

      const baseKras = await getAllKrasAsync(req.body.kraYear);
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
        division: req.body.division || null,
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
        division: req.body.division || null,
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
        .populate('circle', 'name')
        .populate('division', 'name');

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

      const existingEntry = await KraMonthlyEntry.findById(id).select('corporation');
      if (!existingEntry) {
        return res.status(404).json({
          success: false,
          message: 'Entry not found'
        });
      }

      if (!hasCorpAccess(req, existingEntry.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can update only your corporation entries'
        });
      }

      if (!isSuperAdmin(req) && updates.corporation && !hasCorpAccess(req, updates.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You cannot move entry to another corporation'
        });
      }

      delete updates._id;
      delete updates.createdAt;
      delete updates.updatedAt;

      const baseKras = await getAllKrasAsync(updates.kraYear);
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
        division: updates.division || null,
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
        .populate('circle', 'name')
        .populate('division', 'name');

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

      const existingEntry = await KraMonthlyEntry.findById(req.params.id).select('corporation');
      if (!existingEntry) {
        return res.status(404).json({
          success: false,
          message: 'Entry not found'
        });
      }

      if (!hasCorpAccess(req, existingEntry.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can delete only your corporation entries'
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
      const bulkFilter = { _id: { $in: ids } };
      applyCorporationScope(req, bulkFilter);
      const result = await KraMonthlyEntry.deleteMany(bulkFilter);

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
  adminAuth,
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

      const wipeFilter = {};
      applyCorporationScope(req, wipeFilter);
      const result = await KraMonthlyEntry.deleteMany(wipeFilter);

      res.json({
        success: true,
        message: isSuperAdmin(req)
          ? `Deleted ${result.deletedCount} KRA entry submissions`
          : `Deleted ${result.deletedCount} KRA entry submissions for your corporation`,
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
          { username: { $regex: search, $options: 'i' } },
          { mobileNumber: { $regex: search, $options: 'i' } }
        ];
      }

      if (!isSuperAdmin(req)) {
        const corpId = scopedCorporationId(req);
        filter.corporation = corpId ? new mongoose.Types.ObjectId(corpId) : null;
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
  adminAuth,
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

      if (!isSuperAdmin(req) && req.body.role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - Only superadmin can assign superadmin role'
        });
      }

      const targetUser = await User.findById(req.params.id).select('corporation role');
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!hasCorpAccess(req, targetUser.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can update roles only in your corporation'
        });
      }

      if (!isSuperAdmin(req) && targetUser.role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You cannot modify superadmin role'
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
      const user = await User.findById(req.params.id).select('role corporation isActive');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!hasCorpAccess(req, user.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can update status only in your corporation'
        });
      }

      if (!isSuperAdmin(req) && user.role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You cannot change superadmin status'
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

// POST /api/admin/users - Create a new user (superadmin)
router.post(
  '/users',
  adminAuth,
  [
    body('corporation').notEmpty().withMessage('Corporation is required').isMongoId().withMessage('Invalid Corporation ID'),
    body('fullName').notEmpty().withMessage('Full name is required').isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('username')
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters')
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage('Username may contain letters, numbers, dot, underscore and hyphen only'),
    body('mobileNumber')
      .optional({ values: 'falsy' })
      .matches(/^[6-9]\d{9}$/)
      .withMessage('Please enter a valid 10-digit Indian mobile number'),
    body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['user', 'admin', 'superadmin']).withMessage('Invalid role')
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

      const { corporation, fullName, username, mobileNumber, password, role } = req.body;
      const normalizedUsername = String(username || '').trim().toLowerCase();
      const normalizedMobile = String(mobileNumber || '').trim();

      if (!isSuperAdmin(req) && role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - Only superadmin can create superadmin'
        });
      }

      const targetCorporation = isSuperAdmin(req)
        ? corporation
        : String(req.user.corporation || '');

      if (!targetCorporation) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - Admin corporation scope is missing'
        });
      }

      if (!isSuperAdmin(req) && String(corporation) !== targetCorporation) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can create users only in your corporation'
        });
      }

      const corp = await Corporation.findById(targetCorporation);
      if (!corp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid corporation selected'
        });
      }

      const existingByUsername = await User.findOne({ username: normalizedUsername });
      if (existingByUsername) {
        return res.status(409).json({
          success: false,
          message: 'Username already registered'
        });
      }

      if (normalizedMobile) {
        const existingByMobile = await User.findOne({ mobileNumber: normalizedMobile });
        if (existingByMobile) {
          return res.status(409).json({
            success: false,
            message: 'Mobile number already registered'
          });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        corporation: targetCorporation,
        fullName,
        username: normalizedUsername,
        mobileNumber: normalizedMobile || undefined,
        passwordHash,
        role: role || 'user'
      });

      const populated = await User.findById(user._id)
        .select('-passwordHash')
        .populate('corporation', 'name code');

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: populated
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error creating user',
        error: error.message
      });
    }
  }
);

// PUT /api/admin/users/:id - Update user details (superadmin)
router.put(
  '/users/:id',
  adminAuth,
  [
    param('id').isMongoId().withMessage('Invalid ID'),
    body('corporation').optional().isMongoId().withMessage('Invalid Corporation ID'),
    body('fullName').optional().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('username')
      .optional()
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters')
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage('Username may contain letters, numbers, dot, underscore and hyphen only'),
    body('mobileNumber').optional({ values: 'falsy' }).matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian mobile number'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').not().exists().withMessage('Use /users/:id/role to update role'),
    body('isActive').not().exists().withMessage('Use /users/:id/status to update status')
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

      const targetUser = await User.findById(id).select('role corporation');
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!hasCorpAccess(req, targetUser.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can update users only in your corporation'
        });
      }

      if (!isSuperAdmin(req) && targetUser.role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You cannot update superadmin user'
        });
      }

      if (typeof req.body.fullName === 'string') updates.fullName = req.body.fullName;
      if (typeof req.body.username === 'string') updates.username = String(req.body.username).trim().toLowerCase();
      if (typeof req.body.mobileNumber === 'string') {
        const normalizedMobile = String(req.body.mobileNumber).trim();
        updates.mobileNumber = normalizedMobile || undefined;
      }
      if (typeof req.body.corporation === 'string') updates.corporation = req.body.corporation;

      if (req.body.password) {
        updates.passwordHash = await bcrypt.hash(req.body.password, 10);
      }

      if (updates.username) {
        const existingByUsername = await User.findOne({ username: updates.username, _id: { $ne: id } });
        if (existingByUsername) {
          return res.status(409).json({
            success: false,
            message: 'Username already registered'
          });
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'mobileNumber') && updates.mobileNumber) {
        const existingByMobile = await User.findOne({ mobileNumber: updates.mobileNumber, _id: { $ne: id } });
        if (existingByMobile) {
          return res.status(409).json({
            success: false,
            message: 'Mobile number already registered'
          });
        }
      }

      if (updates.corporation) {
        if (!isSuperAdmin(req) && !hasCorpAccess(req, updates.corporation)) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden - You cannot move user to another corporation'
          });
        }
        const corp = await Corporation.findById(updates.corporation);
        if (!corp) {
          return res.status(400).json({
            success: false,
            message: 'Invalid corporation selected'
          });
        }
      }

      const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
        .select('-passwordHash')
        .populate('corporation', 'name code');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      return res.json({
        success: true,
        message: 'User updated successfully',
        data: user
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error updating user',
        error: error.message
      });
    }
  }
);

// DELETE /api/admin/users/:id - Delete user (superadmin)
router.delete(
  '/users/:id',
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
      if (String(req.user.userId) === String(id)) {
        return res.status(400).json({
          success: false,
          message: 'You cannot delete your own account'
        });
      }

      const user = await User.findById(id).select('role corporation isActive');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!hasCorpAccess(req, user.corporation)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can delete users only in your corporation'
        });
      }

      if (!isSuperAdmin(req) && user.role === 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You cannot delete superadmin'
        });
      }

      if (user.role === 'superadmin') {
        const superadminCount = await User.countDocuments({ role: 'superadmin', isActive: true });
        if (superadminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot delete the last active superadmin'
          });
        }
      }

      await User.findByIdAndDelete(id);

      return res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error deleting user',
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
    const corpScope = scopedCorporationId(req);
    const entryFilter = corpScope ? { corporation: new mongoose.Types.ObjectId(corpScope) } : {};
    const userFilter = corpScope
      ? { isActive: true, corporation: new mongoose.Types.ObjectId(corpScope) }
      : { isActive: true };

    const [
      totalEntries,
      totalUsers,
      totalCorporations,
      activeYear,
      recentEntries,
      entriesByMonth,
      entriesByCorporation
    ] = await Promise.all([
      KraMonthlyEntry.countDocuments(entryFilter),
      User.countDocuments(userFilter),
      corpScope ? Corporation.countDocuments({ _id: new mongoose.Types.ObjectId(corpScope) }) : Corporation.countDocuments(),
      FinancialYear.getActive(),
      KraMonthlyEntry.find(entryFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('corporation', 'name code'),
      KraMonthlyEntry.aggregate([
        { $match: entryFilter },
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
        { $match: entryFilter },
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

// ==========================================
// CORPORATION MANAGEMENT
// ==========================================

// GET /api/admin/corporations - List corporations (admin)
router.get('/corporations', adminAuth, async (req, res) => {
  try {
    let corpFilter = {};
    const corpScope = scopedCorporationId(req);
    if (corpScope) {
      corpFilter = { _id: new mongoose.Types.ObjectId(corpScope) };
    }
    const corporations = await Corporation.find(corpFilter).sort({ name: 1 });
    return res.json({
      success: true,
      data: corporations
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching corporations',
      error: error.message
    });
  }
});

// PUT /api/admin/corporations/:id - Rename corporation (scoped for admin)
router.put(
  '/corporations/:id',
  adminAuth,
  [
    param('id').isMongoId().withMessage('Invalid ID'),
    body('name').notEmpty().withMessage('Corporation name is required').isLength({ min: 2 }).withMessage('Corporation name must be at least 2 characters')
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
      const name = String(req.body.name || '').trim();

      if (!hasCorpAccess(req, id)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden - You can rename only your corporation'
        });
      }

      const existing = await Corporation.findOne({ name, _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Corporation with this name already exists'
        });
      }

      const updated = await Corporation.findByIdAndUpdate(
        id,
        { name },
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Corporation not found'
        });
      }

      return res.json({
        success: true,
        message: 'Corporation updated successfully',
        data: updated
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error updating corporation',
        error: error.message
      });
    }
  }
);

// GET /api/admin/dropdown-data - Get all dropdown data for forms
router.get('/dropdown-data', adminAuth, async (req, res) => {
  try {
    const corpScope = scopedCorporationId(req);
    const corpFilter = corpScope
      ? { _id: new mongoose.Types.ObjectId(corpScope) }
      : {};

    const [corporations, regions, circles, kras, financialYears] = await Promise.all([
      Corporation.find(corpFilter).select('name code hasRegions').sort('name'),
      Region.find(corpScope ? { corporation: new mongoose.Types.ObjectId(corpScope) } : {})
        .populate('corporation', 'name code')
        .sort('name'),
      Circle.find()
        .populate('region', '_id name')
        .populate('corporation', 'name code')
        .sort('name'),
      Kra.find().sort('kraNumber'),
      FinancialYear.find().sort({ startDate: -1 })
    ]);

    const circlesScoped = corpScope
      ? circles.filter((c) => String(c?.corporation?._id || c?.corporation || '') === String(corpScope))
      : circles;

    const allowedCorporations = new Set(getAllowedCorporationNames());
    const filteredCorporations = corporations.filter((c) => allowedCorporations.has(String(c?.name || '').trim()));
    const filteredRegions = regions.filter((r) => isAllowedRegionName(r?.corporation?.name, r?.name));
    const filteredCircles = circlesScoped.filter((c) => isAllowedCircleName(c?.corporation?.name, c?.region?.name, c?.name));

    res.json({
      success: true,
      data: {
        corporations: filteredCorporations,
        regions: filteredRegions,
        circles: filteredCircles,
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
