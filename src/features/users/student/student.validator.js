// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** IMPORT VALIDATOR ***************
const { ObjectIdValidator } = require('../../../shared/validators/validator');

// *************** VALIDATION SCHEMA ***************
/**
 * Validation schemas
 * for Student feature.
 *
 * Responsibilities:
 * - Validate required fields
 * - Validate email format
 * - Validate payload structure
 */

/**
 * Validation schema for
 * creating a student.
 *
 * Business rules:
 * - First name is required.
 * - Last name is required.
 * - Email must be valid.
 * - Student number is required.
 */
const CreateStudentValidator = Joi.object({
  first_name: Joi.string().trim().required(),
  last_name: Joi.string().trim().required(),
  email: Joi.string().email().trim().lowercase().required(),
  student_number: Joi.string().trim().required(),
});

/**
 * Validation schema for
 * updating a student.
 *
 * Business rules:
 * - At least one field
 *   must be provided.
 * - Email must remain valid.
 */
const UpdateStudentValidator = Joi.object({
  first_name: Joi.string().trim(),
  last_name: Joi.string().trim(),
  email: Joi.string().email().trim().lowercase(),
  student_number: Joi.string().trim(),
}).min(1);

/**
 * Validation schema for
 * retrieving students
 * by academic year.
 *
 * Business rules:
 * - academic_year_id must
 *   be a valid ObjectId.
 * - page must be >= 1.
 * - limit must be >= 1.
 */
const GetStudentsByAcademicYearSchema = Joi.object({
  academic_year_id: ObjectIdValidator.required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('').optional(),
});

// *************** EXPORT MODULE ***************
module.exports = {
  CreateStudentValidator,
  UpdateStudentValidator,
  GetStudentsByAcademicYearSchema,
};
