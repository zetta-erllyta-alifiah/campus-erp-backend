/**
 * Grade aggregator worker.
 *
 * Responsibility:
 * - Receive a stringified durable job id from the main thread.
 * - Connect to MongoDB inside the worker isolate.
 * - Delegate grading business rules to the academic grading helper.
 * - Persist job status for retry and operational tracking.
 */

// *************** IMPORT CORE ***************
const { parentPort, workerData, isMainThread } = require('worker_threads');

// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const { ConnectDatabase } = require('../core/db');
const { AppError } = require('../core/errors');
const {
  BuildAcademicStandingBulkOperation,
  BuildAggregationVersionKey,
  BuildGradeAggregationLockKey,
  BuildGradeVersionKey,
  BuildRetryDelayMs,
  BuildScoreLookup,
  BuildScoreLookupKey,
  CalculateAverage,
  ClaimGradeAggregationJob,
  CompareRuleValue,
  EvaluateStandingStatus,
  ExecuteAcademicStandingBulkWrite,
  IsDuplicateKeyBulkWriteError,
  LoadCurriculumHierarchy,
  MarkGradeAggregationJobCompleted,
  MarkGradeAggregationJobFailed,
  NormalizeStandingStatus,
  PENDING_STANDING_STATUS,
  ValidateAcademicYearHierarchy,
  ValidateGradingRules,
} = require('../features/academic/grading/grade_aggregation.helper');

// *************** WORKER HELPER FUNCTION ***************

/**
 * Validates and parses the worker payload.
 *
 * @returns {Object} Parsed worker payload.
 * @throws {AppError} When payload is invalid.
 */
function ParseWorkerPayload(serializedWorkerData = workerData) {
  let payload;

  try {
    payload = JSON.parse(serializedWorkerData);
  } catch (error) {
    throw new AppError('INVALID_GRADE_AGGREGATOR_PAYLOAD', 400, 'Invalid grade aggregator payload');
  }

  if (!payload.job_id) {
    throw new AppError('GRADE_AGGREGATOR_JOB_ID_REQUIRED', 400, 'Grade aggregation job id is required');
  }

  return {
    job_id: String(payload.job_id),
  };
}

/**
 * Runs the grade aggregation worker process.
 *
 * @returns {Promise<void>}
 */
async function RunGradeAggregatorWorker() {
  const payload = ParseWorkerPayload();

  await ConnectDatabase({
    autoIndex: false,
  });

  const job = await ClaimGradeAggregationJob(payload.job_id);

  if (!job) {
    throw new AppError('GRADE_AGGREGATION_JOB_NOT_CLAIMABLE', 409, 'Grade aggregation job is not claimable');
  }

  const hierarchy = await LoadCurriculumHierarchy(job.test_id.toString(), job.academic_year_id.toString());
  const { scoreLookup, aggregationVersionByStudentId } = await BuildScoreLookup(
    job.student_ids.map(String),
    hierarchy.tests,
    job.academic_year_id.toString(),
  );

  const bulkOperations = job.student_ids.map((studentId) => {
    const stringStudentId = studentId.toString();

    return BuildAcademicStandingBulkOperation(
      stringStudentId,
      job.academic_year_id.toString(),
      hierarchy,
      scoreLookup,
      aggregationVersionByStudentId.get(stringStudentId),
    );
  });

  if (bulkOperations.length > 0) {
    await ExecuteAcademicStandingBulkWrite(bulkOperations);
  }

  await MarkGradeAggregationJobCompleted(job._id);

  parentPort.postMessage({
    status: 'success',
    job_id: job._id.toString(),
  });
}

/**
 * Reports worker failures to the parent thread and persists job retry state.
 *
 * @param {Error} error - Worker execution error.
 * @param {Object} port - Worker parent port.
 * @param {string|null} jobId - Durable job id when available.
 * @returns {Promise<void>}
 */
async function HandleWorkerFailure(error, port = parentPort, jobId = null) {
  const updatedJob = jobId ? await MarkGradeAggregationJobFailed(jobId, error) : null;

  port.postMessage({
    status: 'error',
    code: error.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
    message: error.message || 'Grade aggregator worker failed',
    job_id: jobId,
    next_run_at: updatedJob?.status === 'retry' ? updatedJob.next_run_at : null,
  });
}

// *************** WORKER BOOTSTRAP ***************
if (!isMainThread) {
  let parsedPayload = null;

  Promise.resolve()
    .then(() => {
      parsedPayload = ParseWorkerPayload();
      return RunGradeAggregatorWorker();
    })
    .catch(async (error) => {
      await HandleWorkerFailure(error, parentPort, parsedPayload?.job_id || null);
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildAcademicStandingBulkOperation,
  BuildAggregationVersionKey,
  BuildGradeAggregationLockKey,
  BuildGradeVersionKey,
  BuildRetryDelayMs,
  BuildScoreLookup,
  BuildScoreLookupKey,
  CalculateAverage,
  ClaimGradeAggregationJob,
  CompareRuleValue,
  EvaluateStandingStatus,
  ExecuteAcademicStandingBulkWrite,
  HandleWorkerFailure,
  IsDuplicateKeyBulkWriteError,
  LoadCurriculumHierarchy,
  MarkGradeAggregationJobCompleted,
  MarkGradeAggregationJobFailed,
  NormalizeStandingStatus,
  PENDING_STANDING_STATUS,
  ParseWorkerPayload,
  RunGradeAggregatorWorker,
  ValidateAcademicYearHierarchy,
  ValidateGradingRules,
};
