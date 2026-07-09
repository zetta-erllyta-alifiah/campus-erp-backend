// *************** IMPORT LIBRARY ***************
const cron = require('node-cron');

// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('../features/academic/enrollment/academic_year.model');
const { NotificationLogModel } = require('../features/system/notifications/notification_log.model');
const { UserModel } = require('../features/users/user/user.model');
const { ErrorLogModel } = require('../core/errors/error_log.model');
const { SendEmail } = require('../shared/services/email.service');

// *************** GLOBAL VARIABLES ***************
const MISSING_GRADE_ALERT = 'MISSING_GRADE_ALERT';
let gradeAuditorTask = null;
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
    await ErrorLogModel.create({
      message: error.message || 'Missing grade auditor failed',
      code: error.code || 'MISSING_GRADE_AUDITOR_ERROR',
      http_status: error.httpStatus || 500,
      source: 'jobs/missing_grades.job.js',
      stack: error.stack || null,
      meta,
    });
  } catch (logError) {
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
    {
      $match: {
        status: 'active',
      },
    },
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
    await NotificationLogModel.create({
      type: MISSING_GRADE_ALERT,
      student_id: missingGrade.student_id,
      test_id: missingGrade.test_id,
      academic_year_id: missingGrade.academic_year_id,
    });

    return true;
  } catch (lockError) {
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
  await NotificationLogModel.init();
}

/**
 * Runs the missing grade audit once.
 *
 * @returns {Promise<void>}
 */
async function RunMissingGradeAudit() {
  if (isGradeAuditorRunning) {
    return;
  }

  isGradeAuditorRunning = true;

  try {
    const teacherUser = await UserModel.findOne({
      role: 'teacher',
    }).select('email').lean();

    if (!teacherUser?.email) {
      await LogMissingGradeJobError(new Error('Teacher email recipient not found'), {
        code: 'MISSING_GRADE_TEACHER_EMAIL_NOT_FOUND',
      });
      return;
    }

    const missingGrades = await FindMissingGradeRecords();

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
  } catch (jobError) {
    await LogMissingGradeJobError(jobError);
  } finally {
    isGradeAuditorRunning = false;
  }
}

/**
 * Initializes the scheduled missing grade auditor.
 *
 * @returns {Promise<Object>} node-cron scheduled task.
 */
async function InitializeGradeAuditorJob() {
  if (gradeAuditorTask) {
    return gradeAuditorTask;
  }

  await EnsureNotificationLogIndexes();

  gradeAuditorTask = cron.schedule('* * * * *', async () => {
    await RunMissingGradeAudit();
  });

  console.log('Missing grade auditor job initialized');

  return gradeAuditorTask;
}

// *************** EXPORT MODULE ***************
module.exports = {
  InitializeGradeAuditorJob,
  RunMissingGradeAudit,
};
