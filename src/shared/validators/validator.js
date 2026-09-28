// *************** IMPORT LIBRARY ***************
const Joi = require('joi');
const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');

// *************** GLOBAL VARIABLES ***************
const OBJECT_ID_HEX_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Shared Joi validator for MongoDB
 * ObjectId values.
 *
 * @type {Joi.StringSchema}
 */
const ObjectIdValidator = Joi.string().custom((value, helpers) => {
  if (!OBJECT_ID_HEX_PATTERN.test(value) || !mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }

  return value;
}, 'ObjectId validation');

/**
 * Validates payload using
 * a Joi schema.
 *
 * Responsibilities:
 * - Execute Joi validation
 * - Aggregate validation errors
 * - Throw standardized GraphQLError
 * @param {Object} schema
 * @param {Object} payload
 * @returns {Object}
 * @throws {GraphQLError}
 */
function ValidateInputWithJoi(schema, payload) {
  // *************** Validate the full payload and remove fields not defined by the schema
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  // *************** Convert Joi validation failures into the shared operational error format
  if (error) {
    throw new GraphQLError(error.details.map((detail) => detail.message).join(', '), {
      extensions: {
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
        meta: null,
      },
    });
  }

  // *************** Return sanitized payload after successful validation
  return value;
}

// *************** EXPORT MODULE ***************
module.exports = {
  ObjectIdValidator,
  ValidateInputWithJoi,
};
