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

/**
 * Validation schema for REST report card route parameters.
 */
const ReportCardRouteParamsSchema = Joi.object({
  academicYearId: ObjectIdValidator.required(),
  studentId: ObjectIdValidator.required(),
});

/**
 * Validation schema for one immutable report card version route.
 */
const ReportCardVersionRouteParamsSchema = ReportCardRouteParamsSchema.keys({
  version: Joi.number().integer().min(1).required(),
});

/**
 * Validation schema for authenticated report card JWT claims.
 */
const ReportCardUserClaimsSchema = Joi.object({
  userId: ObjectIdValidator.required(),
  role: Joi.string().trim().lowercase().required(),
});

// *************** EXPORT MODULE ***************
module.exports = {
  ReportCardRouteParamsSchema,
  ReportCardUserClaimsSchema,
  ReportCardVersionRouteParamsSchema,
  SubmitTestGradesSchema,
};
