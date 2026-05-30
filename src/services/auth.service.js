'use strict';

const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } = require('../utils/jwt');
const { Errors, ErrorCodes } = require('../utils/errors');

const BCRYPT_ROUNDS = 12;

/**
 * Registers a new user and creates their organization (if it doesn't exist)
 * or joins an existing one.
 */
async function register({ name, email, password, organizationName, role }) {
  // Check if email already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw Errors.conflict('Email already registered.', ErrorCodes.EMAIL_ALREADY_EXISTS);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Find or create organization
  let organization = await prisma.organization.findUnique({ where: { name: organizationName } });
  if (!organization) {
    organization = await prisma.organization.create({ data: { name: organizationName } });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      organizationId: organization.id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      createdAt: true,
    },
  });

  const { accessToken, refreshToken } = await _createTokenPair(user);

  return {
    user,
    accessToken,
    refreshToken,
    organization: { id: organization.id, name: organization.name },
  };
}

/**
 * Authenticates a user and returns tokens.
 */
async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw Errors.unauthorized('Invalid email or password.', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    throw Errors.unauthorized('Your account has been deactivated.', ErrorCodes.ACCOUNT_INACTIVE);
  }

  const { accessToken, refreshToken } = await _createTokenPair(user);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh token rotation:
 * 1. Validate incoming refresh token (DB + JWT check)
 * 2. Revoke old token
 * 3. Issue new access + refresh token pair
 *
 * This prevents refresh token reuse attacks.
 */
async function refreshTokens(incomingToken) {
  const payload = verifyRefreshToken(incomingToken);

  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: incomingToken },
    include: { user: true },
  });

  if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
    // If token was already used (revokedAt is set), this is a replay attack.
    // Revoke ALL tokens for this user as a security measure.
    if (tokenRecord?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw Errors.unauthorized('Invalid or expired refresh token.', ErrorCodes.REFRESH_TOKEN_INVALID);
  }

  if (!tokenRecord.user.isActive) {
    throw Errors.unauthorized('Account is deactivated.', ErrorCodes.ACCOUNT_INACTIVE);
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });

  const { accessToken, refreshToken } = await _createTokenPair(tokenRecord.user);
  return { accessToken, refreshToken };
}

/**
 * Revokes a specific refresh token (logout).
 */
async function logout(refreshToken) {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _createTokenPair(user) {
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshTokenValue = generateRefreshToken({ userId: user.id });

  // Store refresh token in DB for revocation tracking
  await prisma.refreshToken.create({
    data: {
      token: refreshTokenValue,
      userId: user.id,
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  return { accessToken, refreshToken: refreshTokenValue };
}

module.exports = { register, login, refreshTokens, logout };
