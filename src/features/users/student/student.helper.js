// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const { StudentModel } = require('./student.model');
const { AppError } = require('../../../core/errors');

// *************** IMPORT UTILITIES ***************

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
 * @throws {AppError}
 */
async function CreateStudentHelper(input) {
  // *************** Validate unique email ***************
  const existingEmail = await StudentModel.findOne({
    email: input.email,
  });

  if (existingEmail) {
    throw new AppError('Email already exists', 'EMAIL_ALREADY_EXISTS', 400);
  }

  // *************** Validate unique student number ***************
  const existingStudentNumber = await StudentModel.findOne({
    student_number: input.student_number,
  });

  if (existingStudentNumber) {
    throw new AppError('Student number already exists', 'STUDENT_NUMBER_ALREADY_EXISTS', 400);
  }

  return StudentModel.create(input);
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
  const academicYearObjectId = new mongoose.Types.ObjectId(input.academic_year_id);

  // *************** Build query filters ***************
  const matchStage = {
    academic_year_ids: academicYearObjectId,
  };

  // *************** Apply search filter ***************
  if (input.search) {
    const searchKeyword = EscapeRegex(input.search);

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
  const page = input.page;
  const limit = input.limit;
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
