'use strict';

const Joi = require('joi');

// ─── User Validators ──────────────────────────────────────────────────────────
const updateUserRoleSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({
    role: Joi.string().valid('ADMIN', 'MANAGER', 'MEMBER').required(),
  }),
};

const updateUserSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),
};

// ─── Project Validators ───────────────────────────────────────────────────────
const createProjectSchema = {
  body: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(2000).allow('', null).optional(),
  }),
};

const updateProjectSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(2000).allow('', null).optional(),
    isArchived: Joi.boolean().optional(),
  }).min(1),
};

const projectIdSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
};

const userIdSchema = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
};

module.exports = {
  updateUserRoleSchema,
  updateUserSchema,
  createProjectSchema,
  updateProjectSchema,
  projectIdSchema,
  userIdSchema,
};
