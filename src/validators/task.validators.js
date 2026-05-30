'use strict';

const Joi = require('joi');

const createTaskSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(5000).allow('', null).optional(),
    priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').default('MEDIUM'),
    assigneeId: Joi.string().uuid().allow(null).optional(),
    projectId: Joi.string().uuid().required(),
    dueDate: Joi.date().iso().greater('now').allow(null).optional()
      .messages({ 'date.greater': 'due_date must be a future date' }),
  }),
};

const updateTaskSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object({
    title: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(5000).allow('', null).optional(),
    priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').optional(),
    assigneeId: Joi.string().uuid().allow(null).optional(),
    dueDate: Joi.date().iso().allow(null).optional(),
  }).min(1).messages({ 'object.min': 'At least one field is required to update' }),
};

const updateTaskStatusSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object({
    status: Joi.string().valid('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED').required(),
    note: Joi.string().max(500).allow('', null).optional(),
  }),
};

const listTasksSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED').optional(),
    priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').optional(),
    assigneeId: Joi.string().uuid().optional(),
    projectId: Joi.string().uuid().optional(),
    sortBy: Joi.string().valid('createdAt', 'dueDate', 'priority', 'status').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

const taskIdSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  listTasksSchema,
  taskIdSchema,
};
