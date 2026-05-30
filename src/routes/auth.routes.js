'use strict';

const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { registerSchema, loginSchema, refreshTokenSchema } = require('../validators/auth.validators');

// POST /api/v1/auth/register
router.post('/register', validate(registerSchema), controller.register);

// POST /api/v1/auth/login
router.post('/login', validate(loginSchema), controller.login);

// POST /api/v1/auth/refresh
router.post('/refresh', validate(refreshTokenSchema), controller.refresh);

// POST /api/v1/auth/logout
router.post('/logout', validate(refreshTokenSchema), controller.logout);

// GET /api/v1/auth/me  — protected
router.get('/me', authenticate, controller.me);

module.exports = router;
