'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { prisma } = require('../config/database');
const { Errors, ErrorCodes } = require('../utils/errors');

/**
 * Verifies the Bearer token and attaches the full user object to req.user.
 * Called on every protected route.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(Errors.unauthorized('No token provided', ErrorCodes.TOKEN_MISSING));
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    const payload = verifyAccessToken(token); // Throws on invalid/expired

    // Fetch from DB to ensure user still exists and is active
    // We do this on every request to immediately revoke access if user is deactivated.
    // Optimization: this result could be cached in Redis for ~1 min if performance is critical.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        isActive: true,
      },
    });

    if (!user) {
      return next(Errors.unauthorized('User not found', ErrorCodes.TOKEN_INVALID));
    }

    if (!user.isActive) {
      return next(Errors.unauthorized('Account is deactivated', ErrorCodes.ACCOUNT_INACTIVE));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
