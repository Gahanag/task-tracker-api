'use strict';

const { AppError, ErrorCodes } = require('../utils/errors');

/**
 * Creates Express middleware that validates req.body, req.params, or req.query
 * against a Joi schema. On success, mutates req[target] with stripped/coerced values.
 * On failure, passes a VALIDATION_ERROR AppError to next().
 *
 * @param {object} schema - { body?: JoiSchema, params?: JoiSchema, query?: JoiSchema }
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [target, joiSchema] of Object.entries(schema)) {
      if (!joiSchema) continue;

      const { error, value } = joiSchema.validate(req[target], {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        errors.push(...error.details.map((d) => d.message.replace(/['"]/g, '')));
      } else {
        req[target] = value; // assign coerced/stripped value
      }
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join('; '), 400, ErrorCodes.VALIDATION_ERROR));
    }

    next();
  };
}

module.exports = { validate };
