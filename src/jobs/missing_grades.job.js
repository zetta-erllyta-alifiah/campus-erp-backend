/**
 * Missing grade auditor cron job.
 *
 * Responsibility:
 * - Scan active academic years for missing student grades.
 * - Send teacher email alerts once per missing grade event.
 * - Persist notification locks so repeated cron runs stay idempotent.
 */

// *************** IMPORT LIBRARY ***************
const cron = require('node-cron');

// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('../features/academic/enrollment/academic_year.model');
const { NotificationLogModel } = require('../features/system/notifications/notification_log.model');
const { UserModel } = require('../features/users/user/user.model');
const { ErrorLogModel } = require('../core/errors/error_log.model');
const { SendEmail } = require('../shared/services/email.service');

// *************** GLOBAL VARIABLES ***************

// Background notification type stored in notification log locks.
const MISSING_GRADE_ALERT = 'MISSING_GRADE_ALERT';

// Cached node-cron task instance used to prevent duplicate scheduler registration.
let gradeAuditorTask = null;

// Runtime guard used to skip overlapping audit executions.
let isGradeAuditorRunning = false;

// *************** JOB HELPER FUNCTION ***************

/**
 * Logs a background job error without interrupting the cron process.
 *
 * @param {Error} error - Error thrown by the background job.
 * @param {Object} meta - Context metadata for debugging.
 * @returns {Promise<void>}
 */
async function LogMissingGradeJobError(error, meta = null) {
  try {
    // *************** Persist cron failures for later operational review
    await ErrorLogModel.create({
      message: error.message || 'Missing grade auditor failed',
      code: error.code || 'MISSING_GRADE_AUDITOR_ERROR',
      http_status: error.httpStatus || 500,
      source: 'jobs/missing_grades.job.js',
      stack: error.stack || null,
      meta,
    });
  } catch (logError) {
    // *************** Keep the cron process alive even when error logging fails
    console.error('Missing grade auditor log failed:', logError);
  }
}

/**
 * Finds active academic-year student/test combinations
 * that do not yet have a matching StudentGrade document.
 *
 * @returns {Promise<Array>} Missing grade records with joined display data.
 */
async function FindMissingGradeRecords() {
  return AcademicYearModel.aggregate([
    // *************** Limit the cron audit to active academic years
    {
      $match: {
        status: 'active',
      },
    },
    // *************** Expand enrolled students and curriculum blocks into audit candidates
    {
      $unwind: '$student_ids',
    },
    {
      $unwind: '$block_ids',
    },
    {
      $lookup: {
        from: 'subjects',
        localField: 'block_ids',
        foreignField: 'block_id',
        as: 'subject_data',
      },
    },
    {
      $unwind: '$subject_data',
    },
    {
      $lookup: {
        from: 'tests',
        localField: 'subject_data._id',
        foreignField: 'subject_id',
        as: 'test_data',
      },
    },
    {
      $unwind: '$test_data',
    },
    // *************** Join submitted grades to detect missing student/test entries
    {
      $lookup: {
        from: 'student_grades',
        let: {
          studentId: '$student_ids',
          testId: '$test_data._id',
          academicYearId: '$_id',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$student_id', '$$studentId'],
                  },
                  {
                    $eq: ['$test_id', '$$testId'],
                  },
                  {
                    $eq: ['$academic_year_id', '$$academicYearId'],
                  },
                ],
              },
            },
          },
        ],
        as: 'grade_data',
      },
    },
    {
      $match: {
        grade_data: {
          $size: 0,
        },
      },
    },
    // *************** Join notification locks to avoid resending existing alerts
    {
      $lookup: {
        from: 'notification_logs',
        let: {
          studentId: '$student_ids',
          testId: '$test_data._id',
          academicYearId: '$_id',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$type', MISSING_GRADE_ALERT],
                  },
                  {
                    $eq: ['$student_id', '$$studentId'],
                  },
                  {
                    $eq: ['$test_id', '$$testId'],
                  },
                  {
                    $eq: ['$academic_year_id', '$$academicYearId'],
                  },
                ],
              },
            },
          },
        ],
        as: 'notification_data',
      },
    },
    {
      $match: {
        notification_data: {
          $size: 0,
        },
      },
    },
    // *************** Attach student display data required by the alert email
    {
      $lookup: {
        from: 'students',
        localField: 'student_ids',
        foreignField: '_id',
        as: 'student_data',
      },
    },
    {
      $unwind: '$student_data',
    },
    // *************** Shape the cron audit result into email-ready missing grade records
    {
      $project: {
        _id: 0,
        academic_year_id: '$_id',
        academic_year_name: '$name',
        student_id: '$student_ids',
        student_first_name: '$student_data.first_name',
        student_last_name: '$student_data.last_name',
        student_number: '$student_data.student_number',
        test_id: '$test_data._id',
        test_name: '$test_data.name',
        subject_name: '$subject_data.name',
      },
    },
  ]);
}

/**
 * Builds the HTML body for a missing grade alert.
 *
 * @param {Object} missingGrade - Missing grade aggregation result.
 * @returns {string} HTML email body.
 */
function BuildMissingGradeEmailBody(missingGrade) {
  // *************** Build the display name once for the teacher notification
  const studentName = `${missingGrade.student_first_name} ${missingGrade.student_last_name}`.trim();

  return `
    <h2>Missing Grade Alert</h2>
    <p>A grade entry is missing for the active academic year.</p>
    <ul>
      <li><strong>Academic Year:</strong> ${missingGrade.academic_year_name}</li>
      <li><strong>Student:</strong> ${studentName} (${missingGrade.student_number})</li>
      <li><strong>Subject:</strong> ${missingGrade.subject_name}</li>
      <li><strong>Test:</strong> ${missingGrade.test_name}</li>
    </ul>
    <p>Please submit the missing score through the grading workflow.</p>
  `;
}

/**
 * Checks whether a MongoDB write error is caused by
 * the notification unique compound index.
 *
 * @param {Error} error - MongoDB or Mongoose write error.
 * @returns {boolean} True when the write failed because the lock already exists.
 */
function IsDuplicateNotificationLockError(error) {
  return error?.code === 11000;
}

/**
 * Creates the notification lock before sending email.
 *
 * This mirrors the StudentGrade unique-index guard:
 * only the first cron process that writes this document
 * may send the email for the missing grade event.
 *
 * @param {Object} missingGrade - Missing grade aggregation result.
 * @returns {Promise<boolean>} True when this process acquired the lock.
 */
async function CreateMissingGradeNotificationLock(missingGrade) {
  try {
    // *************** Create an idempotency lock before sending the cron email
    await NotificationLogModel.create({
      type: MISSING_GRADE_ALERT,
      student_id: missingGrade.student_id,
      test_id: missingGrade.test_id,
      academic_year_id: missingGrade.academic_year_id,
    });

    return true;
  } catch (lockError) {
    // *************** Skip this alert when another cron process already created the lock
    if (IsDuplicateNotificationLockError(lockError)) {
      return false;
    }

    throw lockError;
  }
}

/**
 * Ensures the notification log collection and indexes
 * are ready before the scheduled job starts.
 *
 * @returns {Promise<void>}
 */
async function EnsureNotificationLogIndexes() {
  // *************** Initialize the unique lock index before cron execution begins
  await NotificationLogModel.init();
}

/**
 * Runs the missing grade audit once.
 *
 * @returns {Promise<void>}
 */
async function RunMissingGradeAudit() {
  // *************** Prevent a long-running audit from overlapping with the next cron tick
  if (isGradeAuditorRunning) {
    return;
  }

  isGradeAuditorRunning = true;

  try {
    // *************** START: Resolve teacher notification recipient ***************
    const teacherUser = await UserModel.findOne({
      role: 'teacher',
    }).select('email').lean();

    if (!teacherUser?.email) {
      await LogMissingGradeJobError(new Error('Teacher email recipient not found'), {
        code: 'MISSING_GRADE_TEACHER_EMAIL_NOT_FOUND',
      });
      return;
    }
    // *************** END: Resolve teacher notification recipient ***************

    // *************** START: Find missing grade events that have not been alerted ***************
    const missingGrades = await FindMissingGradeRecords();
    // *************** END: Find missing grade events that have not been alerted ***************

    // *************** START: Send one idempotent alert per missing grade event ***************
    for (const missingGrade of missingGrades) {
      try {
        const notificationLockCreated = await CreateMissingGradeNotificationLock(missingGrade);

        if (!notificationLockCreated) {
          continue;
        }

        await SendEmail(
          teacherUser.email,
          `Missing grade: ${missingGrade.test_name}`,
          BuildMissingGradeEmailBody(missingGrade),
        );
      } catch (notificationError) {
        await LogMissingGradeJobError(notificationError, {
          student_id: missingGrade.student_id,
          test_id: missingGrade.test_id,
          academic_year_id: missingGrade.academic_year_id,
        });
      }
    }
    // *************** END: Send one idempotent alert per missing grade event ***************
  } catch (jobError) {
    await LogMissingGradeJobError(jobError);
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

  // *************** Prepare notification lock indexes before registering the cron task
  await EnsureNotificationLogIndexes();

  // *************** Run the missing grade auditor once every minute
  gradeAuditorTask = cron.schedule('* * * * *', async () => {
    await RunMissingGradeAudit();
  });

  // *************** Log scheduler readiness for application startup visibility
  console.log('Missing grade auditor job initialized');

  return gradeAuditorTask;
}

// *************** EXPORT MODULE ***************
module.exports = {
  InitializeGradeAuditorJob,
  RunMissingGradeAudit,
};
