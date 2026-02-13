const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('⚠️  JWT_SECRET not configured. Using insecure default - NOT FOR PRODUCTION!');
    return 'dev_secret_change_me_in_production';
  }
  return secret;
}

module.exports = function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
};
