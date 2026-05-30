'use strict';

/**
 * Custom error class for all API errors.
 * Ensures consistent error shape: { status, code, message }
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Error Codes ──────────────────────────────────────────────────────────────
const ErrorCodes = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  CROSS_ORG_ACCESS: 'CROSS_ORG_ACCESS',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INVALID_ASSIGNEE: 'INVALID_ASSIGNEE',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',

  // Conflicts
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  ORG_ALREADY_EXISTS: 'ORG_ALREADY_EXISTS',

  // Server
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
};

// ─── Factory helpers ──────────────────────────────────────────────────────────
const Errors = {
  badRequest: (msg, code = ErrorCodes.VALIDATION_ERROR) =>
    new AppError(msg, 400, code),

  unauthorized: (msg = 'Authentication required', code = ErrorCodes.TOKEN_MISSING) =>
    new AppError(msg, 401, code),

  forbidden: (msg = 'You do not have permission to perform this action', code = ErrorCodes.FORBIDDEN) =>
    new AppError(msg, 403, code),

  notFound: (resource = 'Resource', code = ErrorCodes.NOT_FOUND) =>
    new AppError(`${resource} not found`, 404, code),

  conflict: (msg, code) =>
    new AppError(msg, 409, code),

  internal: (msg = 'Internal server error') =>
    new AppError(msg, 500, ErrorCodes.INTERNAL_SERVER_ERROR),
};

module.exports = { AppError, ErrorCodes, Errors };
