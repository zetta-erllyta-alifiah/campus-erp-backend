// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** IMPORT VALIDATOR ***************
const { ObjectIdValidator } = require('../../../shared/validators/validator');

// *************** VALIDATION SCHEMA ***************

/**
 * Validation schema for submitting
 * a test grade batch.
 */
const SubmitTestGradesSchema = Joi.object({
  academic_year_id: ObjectIdValidator.required(),
  test_id: ObjectIdValidator.required(),
  grades: Joi.array()
    .items(
      Joi.object({
        student_id: ObjectIdValidator.required(),
        score: Joi.number().min(0).max(100).required(),
      }),
    )
    .min(1)
    .required(),
});

// *************** EXPORT MODULE ***************
module.exports = {
  SubmitTestGradesSchema,
};
