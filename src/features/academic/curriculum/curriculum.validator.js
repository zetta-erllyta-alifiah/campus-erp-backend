// *************** IMPORT LIBRARY ***************
const Joi = require('joi');
const mongoose = require('mongoose');

/**
 * Curriculum validation schemas.
 *
 * This file contains validation rules for:
 * - Block
 * - Subject
 * - Test
 *
 * Validation responsibilities:
 * - Input shape validation
 * - ObjectId validation
 * - Weightage validation
 * - Grading rule validation
 */

/// *************** SHARED VALIDATORS ***************
/**
 * Validates MongoDB ObjectId.
 *
 * @type {Joi.StringSchema}
 */
const objectIdValidator = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }

  return value;
}, 'ObjectId validation');

/**
 * Validates grading rule objects.
 *
 * Supported operators:
 * - >
 * - >=
 * - <
 * - <=
 * - ==
 */
const gradingRuleValidator = Joi.object({
  label: Joi.string().trim().required(),
  operator: Joi.string().valid('>', '>=', '<', '<=', '==').required(),
  threshold: Joi.number().required(),
});

// *************** BLOCK VALIDATORS ***************
/**
 * Validates block creation payload.
 */
const CreateBlockValidator = Joi.object({
  name: Joi.string().trim().required(),
  academic_year: Joi.string().trim().required(),
  grading_rules: Joi.array().items(gradingRuleValidator).default([]),
});

/**
 * Validates block update payload.
 *
 * At least one field
 * must be provided.
 */
const UpdateBlockValidator = Joi.object({
  name: Joi.string().trim(),
  academic_year: Joi.string().trim(),
  grading_rules: Joi.array().items(gradingRuleValidator),
}).min(1);

// *************** SUBJECT VALIDATORS ***************
/**
 * Validates subject creation payload.
 *
 * Business rules:
 * - block_id must be a valid ObjectId.
 * - weightage must be between
 *   0 and 100.
 */
const CreateSubjectValidator = Joi.object({
  name: Joi.string().trim().required(),
  block_id: objectIdValidator.required(),
  weightage: Joi.number().positive().max(100).required(),
  grading_rules: Joi.array().items(gradingRuleValidator).default([]),
});

/**
 * Validates subject update payload.
 *
 * At least one field
 * must be provided.
 */
const UpdateSubjectValidator = Joi.object({
  name: Joi.string().trim(),
  weightage: Joi.number().positive().max(100),
  grading_rules: Joi.array().items(gradingRuleValidator),
}).min(1);

/**
 * Validates test creation payload.
 *
 * Business rules:
 * - subject_id must be a valid ObjectId.
 * - weightage must be between
 *   0 and 100.
 */
const CreateTestValidator = Joi.object({
  name: Joi.string().trim().required(),
  subject_id: objectIdValidator.required(),
  weightage: Joi.number().positive().max(100).required(),
  grading_rules: Joi.array().items(gradingRuleValidator).default([]),
});

/**
 * Validates test update payload.
 *
 * At least one field
 * must be provided.
 */
const UpdateTestValidator = Joi.object({
  name: Joi.string().trim(),
  weightage: Joi.number().positive().max(100),
  grading_rules: Joi.array().items(gradingRuleValidator),
}).min(1);

/**
 * Validates block identifier.
 */
const BlockIdValidator = Joi.object({
  block_id: objectIdValidator.required(),
});

/**
 * Validates subject identifier.
 */
const SubjectIdValidator = Joi.object({
  subject_id: objectIdValidator.required(),
});

/**
 * Validates test identifier.
 */
const TestIdValidator = Joi.object({
  test_id: objectIdValidator.required(),
});

// *************** EXPORT MODULE ***************
module.exports = {
  CreateBlockValidator,
  UpdateBlockValidator,

  CreateSubjectValidator,
  UpdateSubjectValidator,

  CreateTestValidator,
  UpdateTestValidator,

  BlockIdValidator,
  SubjectIdValidator,
  TestIdValidator,
};
