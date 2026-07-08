// *************** IMPORT LIBRARY ***************
const Joi = require('joi');
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************
const OBJECT_ID_HEX_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Custom validator for MongoDB
 * ObjectId values.
 */
const objectIdValidator = Joi.string().custom((value, helpers) => {
  if (!OBJECT_ID_HEX_PATTERN.test(value) || !mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }

  return value;
}, 'ObjectId validation');

/**
 * Validation schema for submitting
 * a test grade batch.
 */
const SubmitTestGradesSchema = Joi.object({
  academic_year_id: objectIdValidator.required(),
  test_id: objectIdValidator.required(),
  grades: Joi.array()
    .items(
      Joi.object({
        student_id: objectIdValidator.required(),
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
