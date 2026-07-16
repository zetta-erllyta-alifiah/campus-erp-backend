// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** IMPORT VALIDATOR ***************
const { ObjectIdValidator } = require('../../../shared/validators/validator');

// *************** VALIDATION SCHEMA ***************

// Maximum grade rows accepted by one mutation before the caller must split
// a larger cohort into smaller controlled batches.
const MAX_SUBMIT_TEST_GRADES_BATCH_SIZE = 100;

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
    .max(MAX_SUBMIT_TEST_GRADES_BATCH_SIZE)
    .messages({
      'array.max': `SubmitTestGrades accepts at most ${MAX_SUBMIT_TEST_GRADES_BATCH_SIZE} grade rows; split larger cohorts into controlled batches.`,
    })
    .required(),
});

// *************** EXPORT MODULE ***************
module.exports = {
  MAX_SUBMIT_TEST_GRADES_BATCH_SIZE,
  SubmitTestGradesSchema,
};
