const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Corporation = require('../models/Corporation');
const auth = require('../middleware/auth');

const router = express.Router();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('⚠️  JWT_SECRET not configured. Using insecure default - NOT FOR PRODUCTION!');
    return 'dev_secret_change_me_in_production';
  }
  return secret;
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      mobileNumber: user.mobileNumber,
      role: user.role || 'user'
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('corporation').notEmpty().withMessage('Corporation is required').isMongoId().withMessage('Invalid Corporation ID'),
    body('fullName').notEmpty().withMessage('Full name is required').isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('mobileNumber').notEmpty().withMessage('Mobile number is required').matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian mobile number'),
    body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array().map((err) => ({ field: err.path, message: err.msg }))
        });
      }

      const { corporation, fullName, mobileNumber, password } = req.body;

      const corp = await Corporation.findById(corporation);
      if (!corp) {
        return res.status(400).json({ success: false, message: 'Invalid corporation selected' });
      }

      const existing = await User.findOne({ mobileNumber });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Mobile number already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await User.create({
        corporation,
        fullName,
        mobileNumber,
        passwordHash
      });

      const token = signToken(user);

      const populatedUser = await User.findById(user._id).populate('corporation', 'name code location hasRegions');

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          token,
          user: {
            id: populatedUser._id,
            fullName: populatedUser.fullName,
            mobileNumber: populatedUser.mobileNumber,
            corporation: populatedUser.corporation,
            role: populatedUser.role || 'user'
          }
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error registering user',
        error: error.message
      });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('mobileNumber').notEmpty().withMessage('Mobile number is required').matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian mobile number'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array().map((err) => ({ field: err.path, message: err.msg }))
        });
      }

      const { mobileNumber, password } = req.body;
      const user = await User.findOne({ mobileNumber }).populate('corporation', 'name code location hasRegions');

      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = signToken(user);

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user._id,
            fullName: user.fullName,
            mobileNumber: user.mobileNumber,
            corporation: user.corporation,
            role: user.role || 'user'
          }
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error logging in',
        error: error.message
      });
    }
  }
);

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('corporation', 'name code location hasRegions');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return res.json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        mobileNumber: user.mobileNumber,
        corporation: user.corporation,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching profile', error: error.message });
  }
});

module.exports = router;
