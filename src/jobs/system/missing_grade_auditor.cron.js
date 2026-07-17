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
  // *************** START: Prevent overlapping audit execution ***************
  // *************** Prevent a long-running audit from overlapping with the next cron tick
  if (isGradeAuditorRunning) {
    return;
  }

  isGradeAuditorRunning = true;
  // *************** END: Prevent overlapping audit execution ***************

  try {
    // *************** START: Execute scheduled missing grade audit ***************
    await RunMissingGradeAuditHelper();
    // *************** END: Execute scheduled missing grade audit ***************
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
  // *************** START: Reuse existing scheduled task when already initialized ***************
  // *************** Reuse the existing scheduler when the application initializes more than once
  if (gradeAuditorTask) {
    return gradeAuditorTask;
  }
  // *************** END: Reuse existing scheduled task when already initialized ***************

  // *************** START: Prepare notification log indexes ***************
  // *************** Prepare notification indexes before registering the cron task
  await EnsureMissingGradeAuditIndexesHelper();
  // *************** END: Prepare notification log indexes ***************

  // *************** START: Register cron schedule ***************
  // *************** Run the missing grade auditor once every minute
  gradeAuditorTask = cron.schedule('* * * * *', async () => {
    await RunScheduledMissingGradeAudit();
  });
  // *************** END: Register cron schedule ***************

  // *************** Log scheduler readiness for application startup visibility
  console.log('Missing grade auditor job initialized');

  return gradeAuditorTask;
}

// *************** EXPORT MODULE ***************
module.exports = {
  InitializeGradeAuditorJob,
};
