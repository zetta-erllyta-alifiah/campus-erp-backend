// *************** IMPORT MODULE ***************
const { AppError } = require('../../core/errors');

/**
 * Validates payload using
 * a Joi schema.
 *
 * Responsibilities:
 * - Execute Joi validation
 * - Aggregate validation errors
 * - Throw standardized AppError
 * @param {Object} schema
 * @param {Object} payload
 * @returns {Object}
 * @throws {AppError}
 */
function ValidateInputWithJoi(schema, payload) {
  // *************** Validate the full payload and remove fields not defined by the schema
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  // *************** Convert Joi validation failures into the shared operational error format
  if (error) {
    throw new AppError('VALIDATION_ERROR', 400, error.details.map((detail) => detail.message).join(', '));
  }

  // *************** Return sanitized payload after successful validation
  return value;
}

// *************** EXPORT MODULE ***************
module.exports = {
  ValidateInputWithJoi,
};
