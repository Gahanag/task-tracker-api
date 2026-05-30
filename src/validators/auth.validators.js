'use strict';

const Joi = require('joi');

const registerSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .required()
      .messages({
        'string.pattern.base': 'password must contain at least one uppercase letter, one lowercase letter, and one number',
      }),
    organizationName: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('ADMIN', 'MANAGER', 'MEMBER').default('MEMBER'),
  }),
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().required(),
  }),
};

const refreshTokenSchema = {
  body: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

module.exports = { registerSchema, loginSchema, refreshTokenSchema };
