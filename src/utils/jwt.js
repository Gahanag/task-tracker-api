'use strict';

const jwt = require('jsonwebtoken');
const { Errors, ErrorCodes } = require('./errors');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function generateAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
    issuer: 'task-tracker-api',
  });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
    issuer: 'task-tracker-api',
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET, { issuer: 'task-tracker-api' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw Errors.unauthorized('Access token expired', ErrorCodes.TOKEN_EXPIRED);
    }
    throw Errors.unauthorized('Invalid access token', ErrorCodes.TOKEN_INVALID);
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET, { issuer: 'task-tracker-api' });
  } catch (err) {
    throw Errors.unauthorized('Invalid or expired refresh token', ErrorCodes.REFRESH_TOKEN_INVALID);
  }
}

// Calculate expiry date for DB storage
function getRefreshTokenExpiry() {
  const days = parseInt(REFRESH_EXPIRES) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
};
