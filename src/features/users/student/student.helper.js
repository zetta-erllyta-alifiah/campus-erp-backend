// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const { StudentModel } = require('./student.model');
const { CreateGraphQLError } = require('../../../core/errors');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const { CreateStudentValidator, GetStudentsByAcademicYearSchema } = require('./student.validator');

// *************** IMPORT HELPER FUNCTION ***************

/**
 * Escapes regular expression
 * special characters.
 *
 * @param {string} value - Search keyword to escape.
 * @returns {string} Escaped regex-safe string.
 */
function EscapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// *************** MUTATION ***************

/**
 * Creates a new student.
 *
 * Business rules:
 * - Student email must be unique.
 * - Student number must be unique.
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {GraphQLError}
 */
async function CreateStudentHelper(input) {
  // *************** Validate and sanitize student payload before uniqueness checks
  const validatedInput = ValidateInputWithJoi(CreateStudentValidator, input);

  // *************** Validate unique email ***************
  const existingEmail = await StudentModel.findOne({
    email: validatedInput.email,
  });

  if (existingEmail) {
    throw CreateGraphQLError('EMAIL_ALREADY_EXISTS', 400, 'Email already exists');
  }

  // *************** Validate unique student number ***************
  const existingStudentNumber = await StudentModel.findOne({
    student_number: validatedInput.student_number,
  });

  if (existingStudentNumber) {
    throw CreateGraphQLError('STUDENT_NUMBER_ALREADY_EXISTS', 400, 'Student number already exists');
  }

  return StudentModel.create(validatedInput);
}

// *************** QUERY ***************

/**
 * Retrieves students enrolled
 * in an academic year with
 * pagination and search.
 *
 * Responsibilities:
 * - Filter students by
 *   academic year.
 * - Apply optional
 *   case-insensitive search.
 * - Execute pagination.
 * - Return pagination metadata.
 *
 * Business rules:
 * - Students must belong to
 *   the specified academic year.
 * - Search is performed against
 *   first name and last name.
 * - Search keywords are escaped
 *   to prevent regex injection.
 *
 * Pagination rules:
 * - page starts from 1.
 * - limit determines the number
 *   of records returned.
 *
 * @param {Object} input
 * @param {string} input.academic_year_id
 * @param {number} input.page
 * @param {number} input.limit
 * @param {string} [input.search]
 * @returns {Promise<Object>}
 * @example
 * {
 *   total_count: 20,
 *   current_page: 1,
 *   total_pages: 2,
 *   data: [...]
 * }
 */
async function GetStudentsByAcademicYearHelper(input) {
  // *************** Validate and sanitize query payload before building aggregation
  const validatedInput = ValidateInputWithJoi(GetStudentsByAcademicYearSchema, input);

  const academicYearObjectId = new mongoose.Types.ObjectId(validatedInput.academic_year_id);

  // *************** Build query filters ***************
  const matchStage = {
    academic_year_ids: academicYearObjectId,
  };

  // *************** Apply search filter ***************
  if (validatedInput.search) {
    const searchKeyword = EscapeRegex(validatedInput.search);

    matchStage.$or = [
      {
        first_name: {
          $regex: searchKeyword,
          $options: 'i',
        },
      },
      {
        last_name: {
          $regex: searchKeyword,
          $options: 'i',
        },
      },
    ];
  }

  // *************** Calculate pagination ***************
  const page = validatedInput.page;
  const limit = validatedInput.limit;
  const skip = (page - 1) * limit;

  // *************** Execute aggregation ***************
  const aggregationResult = await StudentModel.aggregate([
    {
      $match: matchStage,
    },
    {
      $facet: {
        metadata: [
          {
            $count: 'total',
          },
        ],

        data: [
          {
            $skip: skip,
          },
          {
            $limit: limit,
          },
        ],
      },
    },
  ]);

  const metadata = aggregationResult[0]?.metadata || [];
  const totalCount = metadata[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / limit);
  const data = aggregationResult[0]?.data || [];

  return {
    total_count: totalCount,
    current_page: page,
    total_pages: totalPages,
    data,
  };
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateStudentHelper,
  GetStudentsByAcademicYearHelper,
};
