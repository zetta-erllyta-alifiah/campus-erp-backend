/**
 * Grade aggregator worker entrypoint.
 *
 * Responsibility:
 * - Bootstrap the worker thread process.
 * - Delegate worker behavior to the colocated grade aggregator helper.
 * - Close the worker-owned MongoDB connection after success or failure.
 */

// *************** IMPORT CORE ***************
const { isMainThread, workerData, parentPort } = require('worker_threads');

// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const GradeAggregatorWorkerHelper = require('./grade_aggregator.helper');

// *************** WORKER BOOTSTRAP ***************
if (!isMainThread) {
  (async () => {
    let parsedWorkerData;

    try {
      parsedWorkerData = JSON.parse(workerData);
    } catch (_parseError) {
      const invalidPayloadError = new Error('Invalid grade aggregator payload');
      invalidPayloadError.code = 'INVALID_GRADE_AGGREGATOR_PAYLOAD';
      invalidPayloadError.httpStatus = 400;
      throw invalidPayloadError;
    }

    await GradeAggregatorWorkerHelper.RunGradeAggregatorWorker(parsedWorkerData, parentPort);
  })()
    .catch((error) => {
      GradeAggregatorWorkerHelper.HandleWorkerFailure(error, parentPort);
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

// *************** EXPORT MODULE ***************
module.exports = GradeAggregatorWorkerHelper;
