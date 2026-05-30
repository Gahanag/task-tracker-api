'use strict';

const express = require('express');
const { projectController } = require('../controllers/project.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createProjectSchema, updateProjectSchema, projectIdSchema } = require('../validators/common.validators');

const router = express.Router();
router.use(authenticate);

router.get('/', projectController.list);
router.get('/:id', validate(projectIdSchema), projectController.get);
router.post('/', authorize('ADMIN', 'MANAGER'), validate(createProjectSchema), projectController.create);
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(updateProjectSchema), projectController.update);
router.delete('/:id', authorize('ADMIN'), validate(projectIdSchema), projectController.delete);

module.exports = router;
