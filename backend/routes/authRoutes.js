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
      loginId: user.userId || user.mobileNumber,
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
        userId: String(mobileNumber).trim(),
        username: String(mobileNumber).trim(),
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
            userId: populatedUser.userId || populatedUser.username || populatedUser.mobileNumber || '',
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
    body('userId')
      .notEmpty()
      .withMessage('User ID is required')
      .isLength({ min: 3, max: 30 })
      .withMessage('User ID must be between 3 and 30 characters'),
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

      const loginInput = String(req.body.userId || '').trim().toLowerCase();
      const { password } = req.body;
      const user = await User.findOne({
        $or: [
          { userId: loginInput },
          { username: loginInput },
          // Backward compatibility: if older accounts still use mobile as login identifier.
          { mobileNumber: loginInput }
        ]
      }).populate('corporation', 'name code location hasRegions');

      if (!user) {
        return res.status(401).json({
          success: false,
          code: 'USER_ID_NOT_FOUND',
          message: 'User ID not found'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is inactive. Please contact administrator'
        });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({
          success: false,
          code: 'INCORRECT_PASSWORD',
          message: 'Incorrect password'
        });
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
            userId: user.userId || user.username || user.mobileNumber || '',
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
        userId: user.userId || user.username || user.mobileNumber || '',
        mobileNumber: user.mobileNumber,
        corporation: user.corporation,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching profile', error: error.message });
  }
});

const validateProfileUpdate = [
  body('fullName')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters'),
  body('userId')
    .optional()
    .isLength({ min: 3, max: 30 })
    .withMessage('User ID must be between 3 and 30 characters')
    .matches(/^[a-z0-9._-]+$/)
    .withMessage('User ID can contain only lowercase letters, numbers, dot, underscore, and hyphen'),
  body('mobileNumber')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid 10-digit Indian mobile number')
];

async function handleProfileUpdate(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((err) => ({ field: err.path, message: err.msg }))
      });
    }

    const { fullName, userId, mobileNumber } = req.body;

    if (typeof fullName === 'undefined' && typeof userId === 'undefined' && typeof mobileNumber === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'No profile fields provided for update'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (typeof mobileNumber !== 'undefined' && mobileNumber !== user.mobileNumber) {
      const existing = await User.findOne({ mobileNumber, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Mobile number already registered' });
      }
    }

    if (typeof userId !== 'undefined') {
      const normalizedUserId = String(userId).trim().toLowerCase();
      const existing = await User.findOne({
        _id: { $ne: user._id },
        $or: [{ userId: normalizedUserId }, { username: normalizedUserId }],
      });
      if (existing) {
        return res.status(409).json({ success: false, message: 'User ID already registered' });
      }
      user.userId = normalizedUserId;
      user.username = normalizedUserId;
    }

    if (typeof fullName !== 'undefined') {
      user.fullName = String(fullName).trim();
    }
    if (typeof mobileNumber !== 'undefined') {
      user.mobileNumber = String(mobileNumber).trim();
    }

    await user.save();

    const populatedUser = await User.findById(user._id).populate('corporation', 'name code location hasRegions');

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: populatedUser._id,
        fullName: populatedUser.fullName,
        userId: populatedUser.userId || populatedUser.username || populatedUser.mobileNumber || '',
        mobileNumber: populatedUser.mobileNumber,
        corporation: populatedUser.corporation,
        role: populatedUser.role || 'user'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
}

// Profile update aliases (for client compatibility across methods/paths)
router.put('/profile', auth, validateProfileUpdate, handleProfileUpdate);
router.patch('/profile', auth, validateProfileUpdate, handleProfileUpdate);
router.post('/profile', auth, validateProfileUpdate, handleProfileUpdate);
router.put('/update-profile', auth, validateProfileUpdate, handleProfileUpdate);
router.patch('/update-profile', auth, validateProfileUpdate, handleProfileUpdate);
router.post('/update-profile', auth, validateProfileUpdate, handleProfileUpdate);

const validatePasswordUpdate = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
];

async function handlePasswordUpdate(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((err) => ({ field: err.path, message: err.msg }))
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const sameAsOld = await bcrypt.compare(String(newPassword), user.passwordHash);
    if (sameAsOld) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error updating password',
      error: error.message
    });
  }
}

// Password update aliases (for client compatibility across methods/paths)
router.put('/password', auth, validatePasswordUpdate, handlePasswordUpdate);
router.patch('/password', auth, validatePasswordUpdate, handlePasswordUpdate);
router.post('/password', auth, validatePasswordUpdate, handlePasswordUpdate);
router.put('/change-password', auth, validatePasswordUpdate, handlePasswordUpdate);
router.patch('/change-password', auth, validatePasswordUpdate, handlePasswordUpdate);
router.post('/change-password', auth, validatePasswordUpdate, handlePasswordUpdate);

module.exports = router;
