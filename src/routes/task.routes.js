'use strict';

const router = require('express').Router();
const controller = require('../controllers/task.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  listTasksSchema,
  taskIdSchema,
} = require('../validators/task.validators');

// All task routes require authentication
router.use(authenticate);

// GET  /api/v1/tasks        — ALL roles (MEMBER sees only assigned tasks — enforced in service)
router.get('/', validate(listTasksSchema), controller.listTasks);

// GET  /api/v1/tasks/:id    — ALL roles (MEMBER restricted in service)
router.get('/:id', validate(taskIdSchema), controller.getTask);

// POST /api/v1/tasks        — ADMIN and MANAGER only
router.post('/', authorize('ADMIN', 'MANAGER'), validate(createTaskSchema), controller.createTask);

// PATCH /api/v1/tasks/:id/status — ALL roles (permission enforced in service: assignee or MANAGER+)
router.patch('/:id/status', validate(updateTaskStatusSchema), controller.updateTaskStatus);

// PUT /api/v1/tasks/:id     — ADMIN and MANAGER only (metadata updates)
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(updateTaskSchema), controller.updateTask);

// DELETE /api/v1/tasks/:id  — ADMIN only
router.delete('/:id', authorize('ADMIN'), validate(taskIdSchema), controller.deleteTask);

module.exports = router;
