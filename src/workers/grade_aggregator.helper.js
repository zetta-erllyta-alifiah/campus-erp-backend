/**
 * Grade aggregator worker helper.
 *
 * Responsibility:
 * - Spawn the grade aggregator worker from the main thread.
 * - Validate parsed worker payloads.
 * - Load curriculum and grade data inside the worker isolate.
 * - Persist computed AcademicStanding snapshots.
 * - Report worker lifecycle failures through shared error handling.
 */

// *************** IMPORT CORE ***************
const path = require('path');
const { Worker } = require('worker_threads');

// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** IMPORT MODULE ***************
const { ConnectDatabase } = require('../core/db');
const { AppError, LogAndNormalizeGqlError, WriteStructuredFallbackLog } = require('../core/errors');
const { BlockModel, SubjectModel, TestModel } = require('../features/academic/curriculum/curriculum.model');
const { StudentGradeModel } = require('../features/academic/grading/student_grade.model');
const { AcademicStandingModel } = require('../features/academic/grading/academic_standing.model');

// *************** IMPORT VALIDATOR ***************
const { ObjectIdValidator, ValidateInputWithJoi } = require('../shared/validators/validator');

// *************** GLOBAL VARIABLES ***************

const GRADE_AGGREGATOR_WORKER_PATH = path.resolve(__dirname, 'grade_aggregator.worker.js');
const GRADE_AGGREGATOR_HELPER_SOURCE = 'src/workers/grade_aggregator.helper.js';

const GradeAggregatorWorkerPayloadSchema = Joi.object({
  student_ids: Joi.array().items(ObjectIdValidator.required()).min(1).required(),
  test_id: ObjectIdValidator.required(),
  academic_year_id: ObjectIdValidator.required(),
});

// *************** HELPER FUNCTION ***************

/**
 * Lazily loads grading business rules to avoid a main-thread circular import.
 *
 * @returns {Object} Academic grading helper exports.
 */
function GetGradingBusinessHelper() {
  return require('../features/academic/grading/grading.helper');
}

/**
 * Logs grade aggregation worker lifecycle failures without blocking
 * the grade submission response.
 *
 * @param {Error} error - Worker lifecycle error.
 * @param {Object|null} meta - Safe worker context.
 * @returns {void}
 */
function LogGradeAggregatorWorkerError(error, meta = null) {
  LogAndNormalizeGqlError(error, {
    source: GRADE_AGGREGATOR_HELPER_SOURCE,
    meta,
  }).catch((logError) => {
    WriteStructuredFallbackLog({
      source: GRADE_AGGREGATOR_HELPER_SOURCE,
      error: {
        code: error?.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
        message: error?.message || 'Grade aggregator worker failed',
      },
      log_error: {
        code: logError?.code || 'ERROR_LOG_WRITE_FAILED',
        message: logError?.message || 'Failed to write grade aggregator worker error log',
      },
      meta,
    });
  });
}

/**
 * Builds the stringified worker payload expected by workerData.
 *
 * @param {Object} input - Validated grade submission input.
 * @param {string[]} studentIds - Student IDs included in the submitted batch.
 * @returns {string} Stringified worker payload.
 */
function BuildGradeAggregatorWorkerPayload(input, studentIds) {
  return JSON.stringify({
    student_ids: studentIds.map(String),
    test_id: String(input.test_id),
    academic_year_id: String(input.academic_year_id),
  });
}

/**
 * Spawns the grade aggregation worker in a non-blocking flow.
 *
 * Only stringified identifiers are passed into workerData. This avoids
 * structured clone issues and keeps Mongoose documents out of worker threads.
 *
 * @param {Object} input - Validated grade submission input.
 * @param {string[]} studentIds - Student IDs included in the submitted batch.
 * @returns {void}
 */
function SpawnGradeAggregatorWorker(input, studentIds) {
  const payload = BuildGradeAggregatorWorkerPayload(input, studentIds);

  let worker;

  try {
    worker = new Worker(GRADE_AGGREGATOR_WORKER_PATH, {
      workerData: payload,
    });
  } catch (workerBootstrapError) {
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

  const workerContext = {
    worker_thread_id: worker.threadId,
    test_id: input.test_id,
    academic_year_id: input.academic_year_id,
    student_ids: studentIds,
  };

  worker.on('message', (message) => {
    if (message?.status === 'error') {
      LogGradeAggregatorWorkerError(
        new AppError(
          message.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
          500,
          message.message || 'Grade aggregator worker failed',
          {
            ...workerContext,
            worker_error_code: message.code || null,
            worker_error_meta: message.meta || null,
          },
        ),
        workerContext,
      );
    }
  });

  worker.on('error', (workerError) => {
    LogGradeAggregatorWorkerError(
      new AppError(
        workerError.code || 'GRADE_AGGREGATOR_WORKER_ERROR',
        workerError.httpStatus || 500,
        workerError.message || 'Grade aggregator worker failed',
        {
          ...workerContext,
        },
      ),
      workerContext,
    );
  });

  worker.on('exit', (exitCode) => {
    if (exitCode !== 0) {
      LogGradeAggregatorWorkerError(
        new AppError(
          'GRADE_AGGREGATOR_WORKER_EXITED',
          500,
          `Grade aggregator worker exited with code ${exitCode}`,
          {
            ...workerContext,
            exit_code: exitCode,
          },
        ),
        workerContext,
      );
    }
  });
}

/**
 * Validates the parsed worker payload.
 *
 * @param {Object} parsedWorkerData - Parsed worker payload.
 * @returns {Object} Validated worker payload.
 * @throws {AppError} When payload is invalid.
 */
function ParseWorkerPayload(parsedWorkerData) {
  let validatedPayload;

  try {
    validatedPayload = ValidateInputWithJoi(GradeAggregatorWorkerPayloadSchema, parsedWorkerData);
  } catch (validationError) {
    throw new AppError(
      validationError.extensions?.code || 'INVALID_GRADE_AGGREGATOR_PAYLOAD',
      validationError.extensions?.httpStatus || 400,
      validationError.message || 'Invalid grade aggregator payload',
    );
  }

  return {
    student_ids: [...new Set(validatedPayload.student_ids.map(String))],
    test_id: String(validatedPayload.test_id),
    academic_year_id: String(validatedPayload.academic_year_id),
  };
}

/**
 * Loads the full block hierarchy for the submitted test.
 *
 * @param {string} testId - Submitted test identifier.
 * @param {string} academicYearId - Selected academic year identifier.
 * @returns {Promise<Object>} Block, subject, and test hierarchy.
 * @throws {AppError} When hierarchy references are missing or mismatched.
 */
async function LoadCurriculumHierarchy(testId, academicYearId) {
  const submittedTest = await TestModel.findById(testId).lean();

  if (!submittedTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  const submittedSubject = await SubjectModel.findById(submittedTest.subject_id).lean();

  if (!submittedSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  const block = await BlockModel.findById(submittedSubject.block_id).lean();

  if (!block) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  if (String(block.academic_year_id) !== String(academicYearId)) {
    throw new AppError('TEST_ACADEMIC_YEAR_MISMATCH', 400, 'Test does not belong to the selected academic year', {
      test_id: testId,
      block_id: block._id,
      academic_year_id: academicYearId,
      block_academic_year_id: block.academic_year_id,
    });
  }

  const subjects = await SubjectModel.find({
    block_id: block._id,
  })
    .sort({ created_at: 1, _id: 1 })
    .lean();

  const subjectIds = subjects.map((subject) => subject._id);
  const tests = await TestModel.find({
    subject_id: {
      $in: subjectIds,
    },
  })
    .sort({ created_at: 1, _id: 1 })
    .lean();

  return {
    block,
    subjects,
    tests,
  };
}

/**
 * Builds a score lookup map for selected students and block tests.
 *
 * @param {string[]} studentIds - Student identifiers to aggregate.
 * @param {Object[]} tests - Curriculum tests under the block.
 * @param {string} academicYearId - Academic year identifier.
 * @returns {Promise<Map>} Score lookup map.
 */
async function BuildScoreLookup(studentIds, tests, academicYearId) {
  const { BuildScoreLookupKey } = GetGradingBusinessHelper();
  const testIds = tests.map((test) => test._id);
  const grades = await StudentGradeModel.find({
    student_id: {
      $in: studentIds,
    },
    test_id: {
      $in: testIds,
    },
    academic_year_id: academicYearId,
  })
    .select('student_id test_id score')
    .lean();

  const scoreLookup = new Map();

  for (const grade of grades) {
    scoreLookup.set(BuildScoreLookupKey(grade.student_id, grade.test_id), Number(grade.score || 0));
  }

  return scoreLookup;
}

/**
 * Runs the grade aggregation worker process.
 *
 * @param {Object} parsedWorkerData - Parsed worker payload.
 * @returns {Promise<void>}
 */
async function RunGradeAggregatorWorker(parsedWorkerData, messagePort = null) {
  const {
    BuildAcademicStandingBulkOperation,
    ValidateGradingHierarchyConfiguration,
  } = GetGradingBusinessHelper();
  const payload = ParseWorkerPayload(parsedWorkerData);

  await ConnectDatabase();

  const hierarchy = await LoadCurriculumHierarchy(payload.test_id, payload.academic_year_id);
  ValidateGradingHierarchyConfiguration(hierarchy);

  const scoreLookup = await BuildScoreLookup(payload.student_ids, hierarchy.tests, payload.academic_year_id);
  const bulkOperations = payload.student_ids.map((studentId) => {
    return BuildAcademicStandingBulkOperation(studentId, payload.academic_year_id, hierarchy, scoreLookup, {
      skipHierarchyValidation: true,
    });
  });

  if (bulkOperations.length > 0) {
    await AcademicStandingModel.bulkWrite(bulkOperations, {
      ordered: false,
    });
  }

  if (messagePort) {
    messagePort.postMessage({
      status: 'success',
    });
  }
}

/**
 * Reports worker failures to the parent thread.
 *
 * @param {Error} error - Worker execution error.
 * @returns {void}
 */
function HandleWorkerFailure(error, messagePort = null) {
  if (messagePort) {
    messagePort.postMessage({
      status: 'error',
      code: error.code || error.extensions?.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
      message: error.message || 'Grade aggregator worker failed',
      meta: error.meta || error.extensions?.meta || null,
    });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildGradeAggregatorWorkerPayload,
  BuildScoreLookup,
  GradeAggregatorWorkerPayloadSchema,
  HandleWorkerFailure,
  LoadCurriculumHierarchy,
  LogGradeAggregatorWorkerError,
  ParseWorkerPayload,
  RunGradeAggregatorWorker,
  SpawnGradeAggregatorWorker,
};
