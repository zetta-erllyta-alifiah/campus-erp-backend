/**
 * Missing grade auditor cron job.
 *
 * Responsibility:
 * - Bootstrap and schedule the missing grade auditor.
 */

// *************** IMPORT LIBRARY ***************
const cron = require('node-cron');

// *************** IMPORT MODULE ***************
const {
  EnsureMissingGradeAuditIndexesHelper,
  RunMissingGradeAuditHelper,
} = require('../../features/system/notifications/notification_log.helper');

// *************** GLOBAL VARIABLES ***************

// Cached node-cron task instance used to prevent duplicate scheduler registration.
let gradeAuditorTask = null;

// Runtime guard used to skip overlapping audit executions.
let isGradeAuditorRunning = false;

// *************** JOB HELPER FUNCTION ***************

/**
 * Runs the missing grade auditor while preventing overlapping cron ticks.
 *
 * @returns {Promise<void>}
 */
async function RunScheduledMissingGradeAudit() {
  // *************** Prevent a long-running audit from overlapping with the next cron tick
  if (isGradeAuditorRunning) {
    return;
  }

  isGradeAuditorRunning = true;

  try {
    await RunMissingGradeAuditHelper();
  } finally {
    // *************** Release the runtime guard after each cron audit attempt
    isGradeAuditorRunning = false;
  }
}

/**
 * Initializes the scheduled missing grade auditor.
 *
 * @returns {Promise<Object>} node-cron scheduled task.
 */
async function InitializeGradeAuditorJob() {
  // *************** Reuse the existing scheduler when the application initializes more than once
  if (gradeAuditorTask) {
    return gradeAuditorTask;
  }

  // *************** Prepare notification indexes before registering the cron task
  await EnsureMissingGradeAuditIndexesHelper();

  // *************** Run the missing grade auditor once every minute
  gradeAuditorTask = cron.schedule('* * * * *', async () => {
    await RunScheduledMissingGradeAudit();
  });

  // *************** Log scheduler readiness for application startup visibility
  console.log('Missing grade auditor job initialized');

  return gradeAuditorTask;
}

// *************** EXPORT MODULE ***************
module.exports = {
  InitializeGradeAuditorJob,
};
