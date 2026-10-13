const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'carebridge_research_prototype_jwt_super_secret_key_2026';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
}

// Backward-compatibility alias
function signToken(payload) {
  return signAccessToken(payload);
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Backward-compatibility alias
function verifyToken(token) {
  return verifyAccessToken(token);
}

function generateRefreshTokenString() {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(tokenString) {
  return crypto.createHash('sha256').update(tokenString).digest('hex');
}

/**
 * Returns cookie options enforcing:
 * - httpOnly: true (prevents client JS access)
 * - secure: true ONLY in production mode (allows HTTP in local development)
 * - sameSite: 'lax' (CSRF defense)
 */
function getCookieOptions({ isRefresh = false } = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = isRefresh
    ? REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000 // 7 days
    : 15 * 60 * 1000; // 15 minutes

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

module.exports = {
  JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRY_DAYS,
  signAccessToken,
  signToken,
  verifyAccessToken,
  verifyToken,
  generateRefreshTokenString,
  hashToken,
  getCookieOptions,
};
