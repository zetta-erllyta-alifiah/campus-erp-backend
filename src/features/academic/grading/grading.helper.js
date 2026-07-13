/**
 * Grading business logic layer.
 *
 * Responsibility:
 * - Validate bulk test grade submissions.
 * - Preserve Day 6 all-or-nothing insert behavior.
 * - Spawn the Day 8 academic standing worker after grades are inserted.
 * - Keep the GraphQL response non-blocking while the worker aggregates standings.
 */

// *************** IMPORT CORE ***************
const path = require('path');
const { Worker } = require('worker_threads');

// *************** IMPORT MODULE ***************
const { AppError, LogAndNormalizeGqlError } = require('../../../core/errors');
const { TestModel } = require('../curriculum/curriculum.model');
const { AcademicYearModel } = require('../enrollment/academic_year.model');
const { StudentModel } = require('../../users/student/student.model');
const { StudentGradeModel } = require('./student_grade.model');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const { SubmitTestGradesSchema } = require('./grading.validator');

// *************** GLOBAL VARIABLES ***************

// Absolute path to the grade aggregation worker entry file.
const GRADE_AGGREGATOR_WORKER_PATH = path.resolve(__dirname, '../../../workers/grade_aggregator.worker.js');

// Error log source used for worker lifecycle failures observed by the main thread.
const GRADE_AGGREGATOR_HELPER_SOURCE = 'src/features/academic/grading/grading.helper.js';

// *************** HELPER FUNCTION ***************

/**
 * Logs grade aggregation worker lifecycle failures without blocking
 * the grade submission response.
 *
 * The worker runs outside the GraphQL resolver call stack, so failures are
 * reported here through the shared error logger instead of being thrown back
 * to the client after the grade submission has already succeeded.
 *
 * @param {Error} error - Worker lifecycle error.
 * @returns {void}
 */
function LogGradeAggregatorWorkerError(error) {
  LogAndNormalizeGqlError(error, {
    source: GRADE_AGGREGATOR_HELPER_SOURCE,
  }).catch((logError) => {
    console.error('Grade aggregator worker log failed:', logError);
  });
}

/**
 * Spawns the grade aggregation worker in a non-blocking flow.
 *
 * Only stringified identifiers are passed into workerData. This avoids
 * structured clone issues and satisfies the Day 8 mandate to never pass
 * Mongoose documents or model instances into a worker thread.
 *
 * @param {Object} input - Validated grade submission input.
 * @param {string[]} studentIds - Student IDs included in the submitted batch.
 * @returns {void}
 */
function SpawnGradeAggregatorWorker(input, studentIds) {
  // *************** START: Build worker payload ***************
  // *************** Send only serializable IDs to satisfy the worker stringification mandate
  const payload = JSON.stringify({
    student_ids: studentIds,
    test_id: input.test_id,
    academic_year_id: input.academic_year_id,
  });
  // *************** END: Build worker payload ***************

  // *************** START: Spawn non-blocking worker ***************
  // *************** Spawn the background worker without awaiting so the API response stays non-blocking
  let worker;

  try {
    worker = new Worker(GRADE_AGGREGATOR_WORKER_PATH, {
      workerData: payload,
    });
  } catch (workerBootstrapError) {
    // *************** Log worker bootstrap failures without failing the already-committed grade mutation
    LogGradeAggregatorWorkerError(
      new AppError(
        workerBootstrapError.code || 'GRADE_AGGREGATOR_WORKER_BOOTSTRAP_FAILED',
        workerBootstrapError.httpStatus || 500,
        workerBootstrapError.message || 'Grade aggregator worker bootstrap failed',
        {
          test_id: input.test_id,
          academic_year_id: input.academic_year_id,
          student_ids: studentIds,
        },
      ),
    );
    return;
  }
  // *************** END: Spawn non-blocking worker ***************

  // *************** START: Register worker lifecycle listeners ***************
  // *************** Capture worker-reported operational failures from the parent process
  worker.on('message', (message) => {
    if (message?.status === 'error') {
      LogGradeAggregatorWorkerError(
        new AppError(
          message.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
          500,
          message.message || 'Grade aggregator worker failed',
          {
            test_id: input.test_id,
            academic_year_id: input.academic_year_id,
            student_ids: studentIds,
          },
        ),
      );
    }
  });

  // *************** Capture worker thread crashes that surface through the runtime error event
  worker.on('error', (workerError) => {
    LogGradeAggregatorWorkerError(
      new AppError(
        workerError.code || 'GRADE_AGGREGATOR_WORKER_ERROR',
        workerError.httpStatus || 500,
        workerError.message || 'Grade aggregator worker failed',
        {
          test_id: input.test_id,
          academic_year_id: input.academic_year_id,
          student_ids: studentIds,
        },
      ),
    );
  });

  // *************** Capture abnormal worker exits after the background process terminates
  worker.on('exit', (exitCode) => {
    if (exitCode !== 0) {
      LogGradeAggregatorWorkerError(
        new AppError(
          'GRADE_AGGREGATOR_WORKER_EXITED',
          500,
          `Grade aggregator worker exited with code ${exitCode}`,
          {
            test_id: input.test_id,
            academic_year_id: input.academic_year_id,
            student_ids: studentIds,
            exit_code: exitCode,
          },
        ),
      );
    }
  });
  // *************** END: Register worker lifecycle listeners ***************
}

/**
 * Submits a batch of test grades
 * using pre-validation before any
 * database write occurs.
 *
 * The academic standing worker is spawned only after StudentGrade insertMany
 * succeeds. The worker is intentionally not awaited so the mutation can return
 * the inserted grade documents while aggregation continues in the background.
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

  // *************** START: Trigger non-blocking academic standing aggregation ***************
  SpawnGradeAggregatorWorker(validatedInput, uniqueStudentIds);
  // *************** END: Trigger non-blocking academic standing aggregation ***************

  return insertedGrades;
}

// *************** EXPORT MODULE ***************
module.exports = {
  SubmitTestGradesHelper,
};
