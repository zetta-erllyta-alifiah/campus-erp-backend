// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** IMPORT VALIDATOR ***************
const { ObjectIdValidator } = require('../../../shared/validators/validator');

/**
 * Validation schema for creating
 * a student enrollment batch.
 *
 * Business rules:
 * - academic_year_id must be
 *   a valid MongoDB ObjectId.
 * - student_ids must contain
 *   at least one valid
 *   MongoDB ObjectId.
 */
const CreateEnrollmentValidator = Joi.object({
  academic_year_id: ObjectIdValidator.required(),

  student_ids: Joi.array().items(ObjectIdValidator).min(1).required(),
});

/**
 * Validation schema for updating
 * student enrollment data.
 *
 * Business rules:
 * - student_ids must contain
 *   at least one valid
 *   MongoDB ObjectId.
 */
const UpdateEnrollmentValidator = Joi.object({
  student_ids: Joi.array().items(ObjectIdValidator).min(1),
}).min(1);

// *************** EXPORT MODULE ***************
module.exports = {
  CreateEnrollmentValidator,
  UpdateEnrollmentValidator,
};
