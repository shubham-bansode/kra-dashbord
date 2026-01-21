const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const Corporation = require('../models/Corporation');
const auth = require('../middleware/auth');

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
const validateKraEntry = [
  body('corporation')
    .notEmpty().withMessage('Corporation is required')
    .isMongoId().withMessage('Invalid Corporation ID'),
  
  body('kraYear')
    .notEmpty().withMessage('KRA Year is required')
    .matches(/^\d{4}[-–](\d{2}|\d{4})$/).withMessage('Invalid KRA Year format (e.g., 2024-2025 or 2024–25)'),
  
  body('kra')
    .notEmpty().withMessage('KRA is required')
    .isMongoId().withMessage('Invalid KRA ID'),
  
  body('annualTarget')
    .notEmpty().withMessage('Annual Target is required')
    .isFloat({ min: 0 }).withMessage('Annual Target must be a non-negative number'),
  
  body('achievementDate')
    .notEmpty().withMessage('Achievement Date is required')
    .isISO8601().withMessage('Invalid date format'),
  
  body('kraAchievement')
    .notEmpty().withMessage('KRA Achievement is required')
    .isFloat({ min: 0 }).withMessage('KRA Achievement must be a non-negative number'),
  
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
    if (req.query.kra) filter.kra = req.query.kra;
    if (req.query.kraYear) filter.kraYear = req.query.kraYear;
    if (req.query.month) filter.achievementMonth = parseInt(req.query.month);
    if (req.query.year) filter.achievementYear = parseInt(req.query.year);
    
    const entries = await KraMonthlyEntry.find(filter)
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('kra', 'name unit')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: entries.length,
      data: entries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching KRA entries',
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
      .populate('kra', 'name unit');
    
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
router.post('/', auth, validateKraEntry, validateDateYearMatch, async (req, res) => {
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
    
    // Verify corporation exists and check if it requires regions
    const corporation = await Corporation.findById(req.body.corporation);
    if (!corporation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid corporation selected'
      });
    }
    
    // If corporation has regions, region and circle are required
    if (corporation.hasRegions) {
      if (!req.body.region) {
        return res.status(400).json({
          success: false,
          message: 'Region is required for this corporation',
          errors: [{ field: 'region', message: 'Region is required for MKVDC' }]
        });
      }
      if (!req.body.circle) {
        return res.status(400).json({
          success: false,
          message: 'Circle is required for this corporation',
          errors: [{ field: 'circle', message: 'Circle is required for MKVDC' }]
        });
      }
    }
    
    // Check for duplicate entry
    const duplicate = await KraMonthlyEntry.checkDuplicate(req.body);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'A KRA entry for this organization, KRA, and month already exists',
        errors: [{
          field: 'duplicate',
          message: 'Duplicate entry not allowed for same Corporation + Region + Circle + KRA + Month combination'
        }]
      });
    }
    
    // Attach user metadata (best-effort)
    const entryPayload = {
      ...req.body,
      submittedBy: req.body.submittedBy || req.user.mobileNumber,
      contactNumber: req.body.contactNumber
    };

    // Create entry
    const entry = await KraMonthlyEntry.create(entryPayload);
    
    // Populate for response
    const populatedEntry = await KraMonthlyEntry.findById(entry._id)
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('kra', 'name unit');
    
    res.status(201).json({
      success: true,
      message: 'KRA entry created successfully',
      data: populatedEntry
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry: An entry for this combination already exists'
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
router.put('/:id', auth, validateKraEntry, validateDateYearMatch, async (req, res) => {
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
    
    // Update entry
    const entry = await KraMonthlyEntry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('corporation', 'name code')
      .populate('region', 'name code')
      .populate('circle', 'name code')
      .populate('kra', 'name unit');
    
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

module.exports = router;
