'use strict';

const express = require('express');
const { analyticsController } = require('../controllers/project.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();
router.use(authenticate);
router.get('/', authorize('ADMIN', 'MANAGER'), analyticsController.getAnalytics);

module.exports = router;
