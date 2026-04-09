const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const Corporation = require('../models/Corporation');
const Kra = require('../models/Kra');
const Division = require('../models/Division');
const Circle = require('../models/Circle');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { getAllKrasAsync } = require('../config/kraMaster');
const Region = require('../models/Region');
const {
  isAllowedRegionName,
  isAllowedCircleName
} = require('../config/googleFormHierarchy');

async function validateHierarchyStrict({ corporationDoc, regionId, circleId, divisionId }) {
  if (!corporationDoc?.hasRegions) return { ok: true };

  if (!regionId) {
    return { ok: false, status: 400, message: 'Region is required for this corporation', field: 'region' };
  }
  if (!circleId) {
    return { ok: false, status: 400, message: 'Circle is required for this corporation', field: 'circle' };
  }
  const regionDoc = await Region.findOne({
    _id: regionId,
    corporation: corporationDoc._id,
    isActive: true
  })
    .select('_id name corporation')
    .lean();

  if (!regionDoc) {
    return { ok: false, status: 400, message: 'Invalid region selected', field: 'region' };
  }
  if (!isAllowedRegionName(corporationDoc.name, regionDoc.name)) {
    return { ok: false, status: 400, message: 'Region must match Google Form exactly', field: 'region' };
  }

  const circleDoc = await Circle.findOne({
    _id: circleId,
    corporation: corporationDoc._id,
    region: regionDoc._id,
    isActive: true
  })
    .select('_id name region corporation')
    .lean();

  if (!circleDoc) {
    return { ok: false, status: 400, message: 'Invalid circle selected', field: 'circle' };
  }
  if (!isAllowedCircleName(corporationDoc.name, regionDoc.name, circleDoc.name)) {
    return { ok: false, status: 400, message: 'Circle must match Google Form exactly', field: 'circle' };
  }

  if (divisionId) {
    const divisionDoc = await Division.findOne({ _id: divisionId, isActive: true }).select('_id circle').lean();
    if (!divisionDoc) {
      return { ok: false, status: 400, message: 'Invalid division selected', field: 'division' };
    }
    if (String(divisionDoc.circle) !== String(circleDoc._id)) {
      return {
        ok: false,
        status: 400,
        message: 'Division does not belong to selected circle',
        field: 'division'
      };
    }
  }

  return { ok: true };
}

async function resolveHierarchyNames({ corporationId, regionId, circleId, divisionId }) {
  const [corporationDoc, regionDoc, circleDoc, divisionDoc] = await Promise.all([
    corporationId ? Corporation.findById(corporationId).select('name').lean() : null,
    regionId ? Region.findById(regionId).select('name').lean() : null,
    circleId ? Circle.findById(circleId).select('name').lean() : null,
    divisionId ? Division.findById(divisionId).select('name').lean() : null
  ]);

  return {
    corporationName: corporationDoc?.name || '',
    regionName: regionDoc?.name || '',
    circleName: circleDoc?.name || '',
    divisionName: divisionDoc?.name || ''
  };
}

async function getSubmissionHierarchyForUser(req, incoming) {
  const user = await User.findById(req.user.userId)
    .select('role hierarchyLevel corporation region circle division isActive')
    .lean();

  if (!user || !user.isActive) {
    return { error: 'Unauthorized user context' };
  }

  const normalized = {
    corporation: incoming.corporation || null,
    region: incoming.region || null,
    circle: incoming.circle || null,
    division: incoming.division || null
  };

  const role = String(user.role || '').toLowerCase();
  const level = String(user.hierarchyLevel || '').toLowerCase();

  if (role === 'admin' || role === 'superadmin') {
    return { hierarchy: normalized };
  }

  if (!user.corporation) {
    return { error: 'User hierarchy mapping is incomplete (corporation missing)' };
  }

  // Always anchor normal users to their mapped corporation.
  normalized.corporation = user.corporation;

  if (level === 'division') {
    if (!user.region || !user.circle || !user.division) {
      return { error: 'User hierarchy mapping is incomplete for division level' };
    }
    normalized.region = user.region;
    normalized.circle = user.circle;
    normalized.division = user.division;
  } else if (level === 'circle') {
    if (!user.region || !user.circle) {
      return { error: 'User hierarchy mapping is incomplete for circle level' };
    }
    normalized.region = user.region;
    normalized.circle = user.circle;
  } else if (level === 'region') {
    if (!user.region) {
      return { error: 'User hierarchy mapping is incomplete for region level' };
    }
    normalized.region = user.region;
  }

  return { hierarchy: normalized };
}

function parseKraYear(kraYear) {
  if (!kraYear) return null;
  const match = String(kraYear).trim().match(/^(\d{4})[-–](\d{2}|\d{4})$/);
  if (!match) return null;

  const startYear = parseInt(match[1], 10);
  const endPart = match[2];
  const endYear = endPart.length === 4 ? parseInt(endPart, 10) : startYear + 1;

  return { startYear, endYear };
}

// Validation middleware
const validateSubmission = [
  body('corporation')
    .notEmpty().withMessage('Corporation is required')
    .isMongoId().withMessage('Invalid Corporation ID'),

  body('region')
    .optional({ nullable: true })
    .custom((v) => v === null || v === '' || mongoose.isValidObjectId(v))
    .withMessage('Invalid Region ID'),

  body('circle')
    .optional({ nullable: true })
    .custom((v) => v === null || v === '' || mongoose.isValidObjectId(v))
    .withMessage('Invalid Circle ID'),

  body('division')
    .optional({ nullable: true })
    .custom((v) => v === null || v === '' || mongoose.isValidObjectId(v))
    .withMessage('Invalid Division ID'),

  body('kraYear')
    .notEmpty().withMessage('KRA Year is required')
    .matches(/^\d{4}[-–](\d{2}|\d{4})$/).withMessage('Invalid KRA Year format (e.g., 2024-2025 or 2024–25)'),

  body('achievementDate')
    .notEmpty().withMessage('Achievement Date is required')
    .isISO8601().withMessage('Invalid date format'),

  body('contactNumber')
    .notEmpty().withMessage('Contact Number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian mobile number')
];

// Custom validation for date-year match
const validateDateYearMatch = (req, res, next) => {
  const { kraYear, achievementDate } = req.body;
  
  if (kraYear && achievementDate) {
    const date = new Date(achievementDate);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    const fy = parseKraYear(kraYear);
    if (!fy) {
      return res.status(400).json({
        success: false,
        message: 'Invalid KRA Year format',
        errors: [{
          field: 'kraYear',
          message: 'Invalid KRA Year format'
        }]
      });
    }

    const startYear = fy.startYear;
    const endYear = fy.endYear;
    
    // Financial year runs from April to March
    // April 2024 to March 2025 for FY 2024-25
    const isValidDate = 
      (year === startYear && month >= 4) || // April onwards of start year
      (year === endYear && month <= 3);      // Jan-March of end year
    
    if (!isValidDate) {
      return res.status(400).json({
        success: false,
        message: `Achievement date must be within the financial year ${kraYear} (April ${startYear} to March ${endYear})`,
        errors: [{
          field: 'achievementDate',
          message: `Date must be within FY ${kraYear}`
        }]
      });
    }
  }
  
  next();
};

// GET all entries with filters
router.get('/', async (req, res) => {
  try {
    const filter = {};
    
    // Apply filters from query params
    if (req.query.corporation) filter.corporation = req.query.corporation;
    if (req.query.region) filter.region = req.query.region;
    if (req.query.circle) filter.circle = req.query.circle;
    if (req.query.division) filter.division = req.query.division;
    const kraParam = req.query.kraId || req.query.kra;
    if (kraParam) {
      let kraId = parseInt(kraParam, 10);
      if (Number.isNaN(kraId) && mongoose.isValidObjectId(kraParam)) {
        const kraDoc = await Kra.findById(kraParam).select('kraNumber');
        if (kraDoc?.kraNumber) kraId = kraDoc.kraNumber;
      }
      if (!Number.isNaN(kraId)) {
        filter.kras = { $elemMatch: { kraId } };
      }
    }
    if (req.query.kraYear) filter.kraYear = req.query.kraYear;
    if (req.query.month) filter.achievementMonth = parseInt(req.query.month);
    if (req.query.year) filter.achievementYear = parseInt(req.query.year);
    
    const entries = await KraMonthlyEntry.find(filter)
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('division', 'name code')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: entries.length,
      data: entries
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching KRA entries',
      error: error.message
    });
  }
});

// DEBUG: Get raw entries count (without populate) to check for orphaned data
router.get('/debug/count', async (req, res) => {
  try {
    const totalCount = await KraMonthlyEntry.countDocuments();
    const entries = await KraMonthlyEntry.find().lean();

    res.json({
      success: true,
      totalCount,
      entries: entries.map(e => ({
        _id: e._id,
        corporation: e.corporation,
        region: e.region,
        circle: e.circle,
        kraId: e.kraId,
        kraYear: e.kraYear,
        achievementMonth: e.achievementMonth,
        achievementYear: e.achievementYear,
        createdAt: e.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error in debug count',
      error: error.message
    });
  }
});

// GET single entry
router.get('/:id', async (req, res) => {
  try {
    const entry = await KraMonthlyEntry.findById(req.params.id)
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('division', 'name code');
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'KRA entry not found'
      });
    }
    
    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching KRA entry',
      error: error.message
    });
  }
});

// POST create entry
router.post('/', auth, validateSubmission, validateDateYearMatch, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    
    const resolved = await getSubmissionHierarchyForUser(req, {
      corporation: req.body.corporation,
      region: req.body.region,
      circle: req.body.circle,
      division: req.body.division
    });
    if (resolved.error) {
      return res.status(403).json({
        success: false,
        message: resolved.error
      });
    }

    const resolvedHierarchy = resolved.hierarchy;

    // Verify corporation exists and check if it requires regions
    const corporation = await Corporation.findById(resolvedHierarchy.corporation);
    if (!corporation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid corporation selected'
      });
    }
    
    // If corporation has regions, region and circle are required
    let region = corporation.hasRegions ? resolvedHierarchy.region : null;
    let circle = corporation.hasRegions ? resolvedHierarchy.circle : null;
    const division = corporation.hasRegions ? resolvedHierarchy.division : null;

    const hierarchy = await validateHierarchyStrict({
      corporationDoc: corporation,
      regionId: region,
      circleId: circle,
      divisionId: division
    });
    if (!hierarchy.ok) {
      return res.status(hierarchy.status || 400).json({
        success: false,
        message: hierarchy.message,
        errors: hierarchy.field ? [{ field: hierarchy.field, message: hierarchy.message }] : undefined
      });
    }

    // Build a full 7-KRA payload (all zeros by default)
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

    // Check for duplicate monthly submission
    const duplicate = await KraMonthlyEntry.checkDuplicate({
      corporation: resolvedHierarchy.corporation,
      region,
      circle,
      division,
      achievementDate: req.body.achievementDate
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Entry already exists for the selected month. Cannot submit again.',
        error: 'DUPLICATE_ENTRIES',
        hint: 'Once submitted, only admin can update entries.'
      });
    }

    const entryPayload = {
      corporation: resolvedHierarchy.corporation,
      region,
      circle,
      division,
      kraYear: req.body.kraYear,
      achievementDate: req.body.achievementDate,
      kras,
      selectedKraIds,
      remarks: req.body.remarks || '',
      contactNumber: req.body.contactNumber,
      submittedBy: req.body.submittedBy || req.user.username || req.user.mobileNumber,
      submittedAt: new Date()
    };

    const names = await resolveHierarchyNames({
      corporationId: resolvedHierarchy.corporation,
      regionId: region,
      circleId: circle,
      divisionId: division
    });

    Object.assign(entryPayload, names);

    const entry = await KraMonthlyEntry.create(entryPayload);
    
    // Populate for response
    const populatedEntry = await KraMonthlyEntry.findById(entry._id)
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('division', 'name code');
    
    res.status(201).json({
      success: true,
      message: 'KRA submission created successfully',
      data: populatedEntry
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry for this month already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating KRA entry',
      error: error.message
    });
  }
});

// PUT update entry
router.put('/:id', auth, validateSubmission, validateDateYearMatch, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    
    // Check if entry exists
    const existingEntry = await KraMonthlyEntry.findById(req.params.id);
    if (!existingEntry) {
      return res.status(404).json({
        success: false,
        message: 'KRA entry not found'
      });
    }
    
    // Rebuild a full 7-KRA payload (backend-controlled names/weights)
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

    // MKVDC Pune-only: resolve short-form aliases to canonical IDs for updates too
    let updateRegion = req.body.region || null;
    let updateCircle = req.body.circle || null;
    const updateCorporation = req.body.corporation
      ? await Corporation.findById(req.body.corporation).select('_id name hasRegions')
      : null;

    if (updateCorporation?.hasRegions) {
      const hierarchy = await validateHierarchyStrict({
        corporationDoc: updateCorporation,
        regionId: updateRegion,
        circleId: updateCircle,
        divisionId: req.body.division || null
      });
      if (!hierarchy.ok) {
        return res.status(hierarchy.status || 400).json({
          success: false,
          message: hierarchy.message,
          errors: hierarchy.field ? [{ field: hierarchy.field, message: hierarchy.message }] : undefined
        });
      }
    }

    const updatePayload = {
      corporation: req.body.corporation,
      region: updateRegion,
      circle: updateCircle,
      division: req.body.division || null,
      kraYear: req.body.kraYear,
      achievementDate: req.body.achievementDate,
      kras,
      selectedKraIds,
      remarks: req.body.remarks || '',
      contactNumber: req.body.contactNumber,
      submittedBy: req.body.submittedBy || req.user.username || req.user.mobileNumber
    };

    const names = await resolveHierarchyNames({
      corporationId: req.body.corporation,
      regionId: updateRegion,
      circleId: updateCircle,
      divisionId: req.body.division || null
    });

    Object.assign(updatePayload, names);

    const entry = await KraMonthlyEntry.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true, runValidators: true }
    )
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('division', 'name code');
    
    res.json({
      success: true,
      message: 'KRA entry updated successfully',
      data: entry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating KRA entry',
      error: error.message
    });
  }
});

// DELETE entry
router.delete('/:id', auth, async (req, res) => {
  try {
    const entry = await KraMonthlyEntry.findByIdAndDelete(req.params.id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'KRA entry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'KRA entry deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting KRA entry',
      error: error.message
    });
  }
});

// Check duplicate before submission
router.post('/check-duplicate', async (req, res) => {
  try {
    const duplicate = await KraMonthlyEntry.checkDuplicate(req.body);
    
    res.json({
      success: true,
      isDuplicate: !!duplicate,
      existingEntry: duplicate ? {
        id: duplicate._id,
        submittedAt: duplicate.submittedAt
      } : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking duplicate',
      error: error.message
    });
  }
});

// ==========================================
// BULK SUBMISSION ENDPOINT (INSERT-ONLY)
// ==========================================
/**
 * POST /api/kra-entries/bulk
 * 
 * Accepts multiple KRA items in a single submission with INSERT-ONLY logic:
 * - Stores ONE document per (corporation + region + circle + month + year)
 * - If a submission already exists for that month: REJECTS the submission
 * - If no submission exists: creates one monthly document containing ALL 7 KRAs
 * 
 * IMPORTANT: Users can only INSERT new entries. Only admin can UPDATE existing entries.
 */
router.post('/bulk', auth, async (req, res) => {
  try {
    const { entries } = req.body;
    
    // Validate request
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Entries array is required and must not be empty',
        errors: [{ field: 'entries', message: 'Please provide an array of KRA entries' }]
      });
    }

    // In new schema, bulk means "one submission with up to 7 KRAs"
    if (entries.length > 7) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 7 KRAs allowed per submission',
        errors: [{ field: 'entries', message: 'Too many KRAs. Maximum 7 allowed.' }]
      });
    }

    // Ensure all items belong to the same submission context
    const base = entries[0];
    const sameContext = entries.every((e) =>
      String(e.corporation) === String(base.corporation) &&
      String(e.kraYear) === String(base.kraYear) &&
      String(e.achievementDate) === String(base.achievementDate) &&
      String(e.contactNumber) === String(base.contactNumber) &&
      String(e.region || '') === String(base.region || '') &&
      String(e.circle || '') === String(base.circle || '') &&
      String(e.division || '') === String(base.division || '')
    );

    if (!sameContext) {
      return res.status(400).json({
        success: false,
        message: 'All submitted KRAs must share the same corporation/region/circle/date/year/contact',
        errors: [{ field: 'entries', message: 'Mismatched submission context across entries' }]
      });
    }

    const resolved = await getSubmissionHierarchyForUser(req, {
      corporation: entries[0].corporation,
      region: entries[0].region,
      circle: entries[0].circle,
      division: entries[0].division
    });
    if (resolved.error) {
      return res.status(403).json({
        success: false,
        message: resolved.error
      });
    }

    const resolvedHierarchy = resolved.hierarchy;

    // Verify corporation exists (all entries should have same corporation)
    const corporationId = resolvedHierarchy.corporation;
    const corporation = await Corporation.findById(corporationId);
    if (!corporation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid corporation selected'
      });
    }

    // Validate corporation-specific requirements
    let region = corporation.hasRegions ? resolvedHierarchy.region : null;
    let circle = corporation.hasRegions ? resolvedHierarchy.circle : null;
    const division = corporation.hasRegions ? resolvedHierarchy.division : null;

    const hierarchy = await validateHierarchyStrict({
      corporationDoc: corporation,
      regionId: region,
      circleId: circle,
      divisionId: division
    });
    if (!hierarchy.ok) {
      return res.status(hierarchy.status || 400).json({
        success: false,
        message: hierarchy.message,
        errors: hierarchy.field ? [{ field: hierarchy.field, message: hierarchy.message }] : undefined
      });
    }

    const kraYear = entries[0].kraYear;
    const achievementDate = entries[0].achievementDate;
    const contactNumber = entries[0].contactNumber;
    const remarks = entries[0].remarks || '';
    const submittedBy = entries[0].submittedBy || req.user.username || req.user.mobileNumber;

    // Check duplicate at submission level
    const duplicate = await KraMonthlyEntry.checkDuplicate({
      corporation: corporationId,
      region,
      circle,
      division,
      achievementDate
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Entry already exists for the selected month. Cannot submit again.',
        error: 'DUPLICATE_ENTRIES',
        hint: 'Once submitted, only admin can update entries.'
      });
    }

    // Build full 7-KRA array. If any missing, fill 0.
    const baseKras = await getAllKrasAsync(kraYear);
    const requestMap = new Map(entries.map((e) => [Number(e.kraId), e]));

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

    const submission = await KraMonthlyEntry.create({
      corporation: corporationId,
      region,
      circle,
      division,
      kraYear,
      achievementDate,
      kras,
      selectedKraIds,
      remarks,
      contactNumber,
      submittedBy,
      submittedAt: new Date()
    });

    const names = await resolveHierarchyNames({
      corporationId,
      regionId: region,
      circleId: circle,
      divisionId: division
    });

    await KraMonthlyEntry.findByIdAndUpdate(submission._id, names, {
      runValidators: false
    });

    res.status(201).json({
      success: true,
      message: 'Successfully submitted KRA entry',
      summary: {
        total: 1,
        inserted: 1
      },
      insertedIds: [submission._id]
    });
    
  } catch (error) {
    console.error('Bulk submission error:', error);
    
    // Handle duplicate key error (backup check - shouldn't happen if our logic is correct)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A KRA entry already exists for the selected month. Once submitted, only admin can update entries.',
        error: 'DUPLICATE_KEY',
        hint: 'Please contact admin if you need to update existing entries.'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(field => ({
        field,
        message: error.errors[field].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error processing bulk submission',
      error: error.message
    });
  }
});

module.exports = router;
