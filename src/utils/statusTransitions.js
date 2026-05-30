'use strict';

const { Errors, ErrorCodes } = require('./errors');

/**
 * Valid status transitions:
 *
 *   TODO → IN_PROGRESS → IN_REVIEW → DONE
 *        ↘              ↘            ↘
 *         BLOCKED ←─────────────────── (reachable from any active state)
 *
 * BLOCKED can only transition back to its predecessor state (the state before BLOCKED).
 * We track predecessor in status history for this purpose.
 */
const TRANSITIONS = {
  TODO:        ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED'],
  IN_REVIEW:   ['DONE', 'BLOCKED', 'IN_PROGRESS'], // can send back to rework
  DONE:        [], // terminal state
  BLOCKED:     ['TODO', 'IN_PROGRESS', 'IN_REVIEW'], // unblock to any active state
};

/**
 * Validates that a status transition is allowed.
 * Throws AppError if invalid.
 */
function validateTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw Errors.badRequest(
      `Invalid status transition: ${fromStatus} → ${toStatus}. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      ErrorCodes.INVALID_STATUS_TRANSITION
    );
  }
}

/**
 * Returns allowed transitions from a given status.
 */
function getAllowedTransitions(fromStatus) {
  return TRANSITIONS[fromStatus] || [];
}

module.exports = { validateTransition, getAllowedTransitions, TRANSITIONS };
