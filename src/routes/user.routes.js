'use strict';

const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { updateUserRoleSchema, updateUserSchema, userIdSchema } = require('../validators/common.validators');

router.use(authenticate);

// GET  /api/v1/users         — ADMIN and MANAGER can list org users
router.get('/', authorize('ADMIN', 'MANAGER'), controller.listUsers);

// GET  /api/v1/users/:id     — ADMIN and MANAGER
router.get('/:id', authorize('ADMIN', 'MANAGER'), validate(userIdSchema), controller.getUser);

// PATCH /api/v1/users/:id/role — ADMIN only
router.patch('/:id/role', authorize('ADMIN'), validate(updateUserRoleSchema), controller.updateUserRole);

// PATCH /api/v1/users/:id    — ADMIN only (update name, isActive)
router.patch('/:id', authorize('ADMIN'), validate(updateUserSchema), controller.updateUser);

// DELETE /api/v1/users/:id   — ADMIN only (soft delete: sets isActive=false)
router.delete('/:id', authorize('ADMIN'), validate(userIdSchema), controller.deactivateUser);

module.exports = router;
