'use strict';

const { Errors, ErrorCodes } = require('../utils/errors');

/**
 * Role hierarchy: ADMIN > MANAGER > MEMBER
 * Used to allow "at least this role" checks.
 */
const ROLE_LEVELS = {
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

/**
 * Returns middleware that allows only the specified roles.
 * Must be used AFTER authenticate().
 *
 * Usage:
 *   router.delete('/:id', authenticate, authorize('ADMIN'), handler)
 *   router.patch('/:id', authenticate, authorize('ADMIN', 'MANAGER'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        Errors.forbidden(
          `This action requires one of the following roles: ${allowedRoles.join(', ')}. Your role: ${req.user.role}`,
          ErrorCodes.INSUFFICIENT_ROLE
        )
      );
    }

    next();
  };
}

/**
 * Returns middleware that allows users with AT LEAST the specified role level.
 *
 * Usage:
 *   router.get('/', authenticate, authorizeMinRole('MANAGER'), handler)
 */
function authorizeMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    const userLevel = ROLE_LEVELS[req.user.role] || 0;
    const requiredLevel = ROLE_LEVELS[minRole] || 0;

    if (userLevel < requiredLevel) {
      return next(
        Errors.forbidden(
          `This action requires at minimum the ${minRole} role.`,
          ErrorCodes.INSUFFICIENT_ROLE
        )
      );
    }

    next();
  };
}

/**
 * Ensures the user belongs to the same organization as the resource.
 * Attach orgId to req.params or req.body before this middleware.
 *
 * Usage: Call after fetching a resource and attaching orgId to req.resourceOrgId
 */
function enforceOrgIsolation(req, res, next) {
  const resourceOrgId = req.resourceOrgId;
  if (!resourceOrgId) {
    return next(); // Resource doesn't have an org — skip
  }

  if (req.user.organizationId !== resourceOrgId) {
    return next(
      Errors.forbidden(
        'You cannot access resources belonging to another organization.',
        ErrorCodes.CROSS_ORG_ACCESS
      )
    );
  }

  next();
}

module.exports = { authorize, authorizeMinRole, enforceOrgIsolation, ROLE_LEVELS };
