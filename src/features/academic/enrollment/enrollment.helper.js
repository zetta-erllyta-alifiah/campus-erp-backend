// *************** IMPORT LIBRARY ***************
const { GraphQLError } = require('graphql');

// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('./academic_year.model');
const { StudentModel } = require('../../users/student/student.model');

// *************** IMPORT UTILITIES ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');

// *************** IMPORT VALIDATOR ***************
const { CreateEnrollmentValidator } = require('./enrollment.validator');

// *************** MUTATION ***************

/**
 * Enrolls students into an
 * academic year.
 *
 * Business rules:
 * - Academic year must exist.
 * - Academic year must be active.
 * - All student IDs must exist.
 * - Enrollment update must be
 *   performed bi-directionally.
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {GraphQLError}
 */
async function EnrollStudentsHelper(input) {
  // *************** Validate and sanitize enrollment payload before business rules
  const validatedInput = ValidateInputWithJoi(CreateEnrollmentValidator, input);

  // *************** Validate academic year ***************
  const academicYear = await AcademicYearModel.findById(validatedInput.academic_year_id);

  if (!academicYear) {
    throw new GraphQLError('Academic year not found', {
      extensions: {
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        httpStatus: 404,
        meta: null,
      },
    });
  }

  if (academicYear.status !== 'active') {
    throw new GraphQLError('Academic year is closed', {
      extensions: {
        code: 'ACADEMIC_YEAR_CLOSED',
        httpStatus: 400,
        meta: null,
      },
    });
  }

  // *************** Remove duplicate student IDs ***************
  const uniqueStudentIds = [...new Set(validatedInput.student_ids.map(String))];

  // *************** Validate student references ***************
  const studentCount = await StudentModel.countDocuments({
    _id: {
      $in: uniqueStudentIds,
    },
  });

  if (studentCount !== uniqueStudentIds.length) {
    throw new GraphQLError('Invalid student reference', {
      extensions: {
        code: 'INVALID_STUDENT_REFERENCE',
        httpStatus: 400,
        meta: null,
      },
    });
  }

  // *************** Update academic year enrollment ***************
  const updatedYear = await AcademicYearModel.findByIdAndUpdate(
    validatedInput.academic_year_id,
    {
      $addToSet: {
        student_ids: {
          $each: uniqueStudentIds,
        },
      },
    },
    {
      new: true,
    },
  );

  // *************** Update student academic year references ***************
  await StudentModel.updateMany(
    {
      _id: {
        $in: uniqueStudentIds,
      },
    },
    {
      $addToSet: {
        academic_year_ids: validatedInput.academic_year_id,
      },
    },
  );

  return updatedYear;
}

// *************** EXPORT MODULE ***************
module.exports = {
  EnrollStudentsHelper,
};
