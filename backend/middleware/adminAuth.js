const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('⚠️  JWT_SECRET not configured. Using insecure default - NOT FOR PRODUCTION!');
    return 'dev_secret_change_me_in_production';
  }
  return secret;
}

/**
 * Admin authentication middleware
 * Verifies JWT token and checks if user has admin role
 */
async function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No token provided'
      });
    }

    const payload = jwt.verify(token, getJwtSecret());
    
    // Fetch the user to check role
    const user = await User.findById(payload.userId).select('role fullName username mobileNumber corporation isActive');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - User not found'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Account is deactivated'
      });
    }

    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Admin access required'
      });
    }

    // Attach user info to request
    req.user = {
      userId: user._id,
      role: user.role,
      fullName: user.fullName,
      username: user.username,
      mobileNumber: user.mobileNumber,
      corporation: user.corporation || null
    };
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Token expired'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
}

/**
 * Superadmin only middleware
 */
async function superadminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No token provided'
      });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.userId).select('role fullName username mobileNumber corporation isActive');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Superadmin access required'
      });
    }

    req.user = {
      userId: user._id,
      role: user.role,
      fullName: user.fullName,
      username: user.username,
      mobileNumber: user.mobileNumber,
      corporation: user.corporation || null
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
}

module.exports = { adminAuth, superadminAuth };
