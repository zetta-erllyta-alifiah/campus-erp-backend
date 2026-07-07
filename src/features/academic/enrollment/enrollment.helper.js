// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('./academic_year.model');
const { StudentModel } = require('../../users/student/student.model');
const { AppError } = require('../../../core/errors/app_error');

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
 * @throws {AppError}
 */
async function EnrollStudentsHelper(input) {
  // *************** Validate and sanitize enrollment payload before business rules
  const validatedInput = ValidateInputWithJoi(CreateEnrollmentValidator, input);

  // *************** Validate academic year ***************
  const academicYear = await AcademicYearModel.findById(validatedInput.academic_year_id);

  if (!academicYear) {
    throw new AppError('ACADEMIC_YEAR_NOT_FOUND', 404, 'Academic year not found');
  }

  if (academicYear.status !== 'active') {
    throw new AppError('ACADEMIC_YEAR_CLOSED', 400, 'Academic year is closed');
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
    throw new AppError('INVALID_STUDENT_REFERENCE', 400, 'Invalid student reference');
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
