// *************** IMPORT LIBRARY ***************
const { GraphQLError } = require('graphql');

// *************** IMPORT MODULE ***************
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
 * @throws {GraphQLError} 400 - Invalid student reference or duplicate payload student.
 * @throws {GraphQLError} 404 - Test or academic year not found.
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
    throw new GraphQLError('Test not found', {
      extensions: {
        code: 'TEST_NOT_FOUND',
        httpStatus: 404,
        meta: null,
      },
    });
  }

  if (!existingAcademicYear) {
    throw new GraphQLError('Academic year not found', {
      extensions: {
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        httpStatus: 404,
        meta: null,
      },
    });
  }
  // *************** END: Validate curriculum and cohort references ***************

  // *************** START: Prepare student reference validation ***************
  const extractedStudentIds = validatedInput.grades.map((grade) => String(grade.student_id));
  const uniqueStudentIds = [...new Set(extractedStudentIds)];

  if (uniqueStudentIds.length !== extractedStudentIds.length) {
    throw new GraphQLError('Duplicate student grade input', {
      extensions: {
        code: 'DUPLICATE_STUDENT_GRADE_INPUT',
        httpStatus: 400,
        meta: null,
      },
    });
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
      throw new GraphQLError('Invalid student reference', {
        extensions: {
          code: 'INVALID_STUDENT_REFERENCE',
          httpStatus: 400,
          meta: null,
        },
      });
    }

    if (!enrolledStudentIdSet.has(studentId)) {
      throw new GraphQLError('Student is not enrolled in academic year', {
        extensions: {
          code: 'STUDENT_NOT_ENROLLED_IN_ACADEMIC_YEAR',
          httpStatus: 400,
          meta: null,
        },
      });
    }

    if (existingGradeStudentIdSet.has(studentId)) {
      throw new GraphQLError('Student grade already exists', {
        extensions: {
          code: 'DUPLICATE_STUDENT_GRADE',
          httpStatus: 409,
          meta: null,
        },
      });
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
