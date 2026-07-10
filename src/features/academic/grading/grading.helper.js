// *************** IMPORT MODULE ***************
const { AppError } = require('../../../core/errors');
const { TestModel } = require('../curriculum/curriculum.model');
const { AcademicYearModel } = require('../enrollment/academic_year.model');
const { StudentModel } = require('../../users/student/student.model');
const { StudentGradeModel } = require('./student_grade.model');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const { SubmitTestGradesSchema } = require('./grading.validator');

// *************** HELPER FUNCTION ***************

/**
 * Submits a batch of test grades
 * using pre-validation before any
 * database write occurs.
 *
 * @param {Object} input - Payload containing academic year, test, and student scores.
 * @returns {Promise<Array>} Inserted student grade documents.
 * @throws {AppError} 400 - Invalid student reference or duplicate payload student.
 * @throws {AppError} 404 - Test or academic year not found.
 */
async function SubmitTestGradesHelper(input) {
  // *************** START: Validate input payload ***************
  const validatedInput = ValidateInputWithJoi(SubmitTestGradesSchema, input);
  // *************** END: Validate input payload ***************

  // *************** START: Validate curriculum and cohort references ***************
  const [existingTest, existingAcademicYear] = await Promise.all([
    TestModel.findById(validatedInput.test_id).select('_id').lean(),
    AcademicYearModel.findById(validatedInput.academic_year_id).select('_id student_ids').lean(),
  ]);

  if (!existingTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  if (!existingAcademicYear) {
    throw new AppError('ACADEMIC_YEAR_NOT_FOUND', 404, 'Academic year not found');
  }
  // *************** END: Validate curriculum and cohort references ***************

  // *************** START: Prepare student reference validation ***************
  const extractedStudentIds = validatedInput.grades.map((grade) => String(grade.student_id));
  const uniqueStudentIds = [...new Set(extractedStudentIds)];

  if (uniqueStudentIds.length !== extractedStudentIds.length) {
    throw new AppError('DUPLICATE_STUDENT_GRADE_INPUT', 400, 'Duplicate student grade input');
  }

  const enrolledStudentIdSet = new Set(existingAcademicYear.student_ids.map((studentId) => String(studentId)));
  const validStudents = await StudentModel.find({
    _id: {
      $in: uniqueStudentIds,
    },
  }).select('_id').lean();
  const validStudentIdSet = new Set(validStudents.map((student) => String(student._id)));

  const existingGrades = await StudentGradeModel.find({
    academic_year_id: validatedInput.academic_year_id,
    test_id: validatedInput.test_id,
    student_id: {
      $in: uniqueStudentIds,
    },
  }).select('student_id').lean();

  const existingGradeStudentIdSet = new Set(existingGrades.map((grade) => String(grade.student_id)));
  // *************** END: Prepare student reference validation ***************

  // *************** START: Pre-validate every grade before bulk insert ***************
  for (const grade of validatedInput.grades) {
    const studentId = String(grade.student_id);

    if (!validStudentIdSet.has(studentId)) {
      throw new AppError('INVALID_STUDENT_REFERENCE', 400, 'Invalid student reference');
    }

    if (!enrolledStudentIdSet.has(studentId)) {
      throw new AppError('STUDENT_NOT_ENROLLED_IN_ACADEMIC_YEAR', 400, 'Student is not enrolled in academic year');
    }

    if (existingGradeStudentIdSet.has(studentId)) {
      throw new AppError('DUPLICATE_STUDENT_GRADE', 409, 'Student grade already exists');
    }
  }
  // *************** END: Pre-validate every grade before bulk insert ***************

  // *************** START: Transform and insert grade batch ***************
  const mappedGrades = validatedInput.grades.map((grade) => ({
    student_id: grade.student_id,
    test_id: validatedInput.test_id,
    academic_year_id: validatedInput.academic_year_id,
    score: grade.score,
  }));

  const insertedGrades = await StudentGradeModel.insertMany(mappedGrades, { ordered: true });
  // *************** END: Transform and insert grade batch ***************

  return insertedGrades;
}

// *************** EXPORT MODULE ***************
module.exports = {
  SubmitTestGradesHelper,
};
