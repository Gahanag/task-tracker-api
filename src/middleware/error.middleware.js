'use strict';

const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

/**
 * Global error handler.
 * Returns consistent error shape: { status, code, message }
 */
function errorHandler(err, req, res, next) {
  // Operational errors (AppError) — expected, user-facing
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.statusCode,
      code: err.code,
      message: err.message,
    });
  }

  // Prisma errors — translate to user-friendly messages
  if (err.code) {
    // Unique constraint violation (P2002)
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field';
      return res.status(409).json({
        status: 409,
        code: 'CONFLICT',
        message: `A record with this ${field} already exists.`,
      });
    }

    // Record not found (P2025)
    if (err.code === 'P2025') {
      return res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message: err.meta?.cause || 'Record not found.',
      });
    }

    // Foreign key constraint (P2003)
    if (err.code === 'P2003') {
      return res.status(400).json({
        status: 400,
        code: 'INVALID_REFERENCE',
        message: 'Referenced record does not exist.',
      });
    }
  }

  // JWT errors (shouldn't reach here — handled in auth middleware, but just in case)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ status: 401, code: 'TOKEN_INVALID', message: 'Invalid token.' });
  }

  // Programming errors — log fully, return generic message
  logger.error('Unhandled error:', err);
  return res.status(500).json({
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    status: 404,
    code: 'ROUTE_NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFoundHandler };
