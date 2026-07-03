// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('./academic_year.model');

const { StudentModel } = require('../../users/student/student.model');

const { AppError } = require('../../../core/errors/app_error');

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
 *
 * @param {Object} input
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError}
 */
async function EnrollStudentsHelper(input) {
  // *************** START: Validate academic year ***************
  const academicYear = await AcademicYearModel.findById(input.academic_year_id);

  if (!academicYear) {
    throw new AppError('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND', 404);
  }

  if (academicYear.status !== 'active') {
    throw new AppError('Academic year is closed', 'ACADEMIC_YEAR_CLOSED', 400);
  }
  // *************** END: Validate academic year ***************

  // *************** START: Remove duplicates ***************
  const uniqueStudentIds = [...new Set(input.student_ids.map(String))];
  // *************** END: Remove duplicates ***************

  // *************** START: Validate student references ***************
  const studentCount = await StudentModel.countDocuments({
    _id: {
      $in: uniqueStudentIds,
    },
  });

  if (studentCount !== uniqueStudentIds.length) {
    throw new AppError('Invalid student reference', 'INVALID_STUDENT_REFERENCE', 400);
  }
  // *************** END: Validate student references ***************

  // *************** START: Update academic year ***************
  const updatedYear = await AcademicYearModel.findByIdAndUpdate(
    input.academic_year_id,
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
  // *************** END: Update academic year ***************

  // *************** START: Update students ***************
  await StudentModel.updateMany(
    {
      _id: {
        $in: uniqueStudentIds,
      },
    },
    {
      $addToSet: {
        academic_year_ids: input.academic_year_id,
      },
    },
  );
  // *************** END: Update students ***************

  return updatedYear;
}

// *************** EXPORT MODULE ***************
module.exports = {
  EnrollStudentsHelper,
};
