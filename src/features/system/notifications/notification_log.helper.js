// *************** IMPORT MODULE ***************
const { AcademicYearModel } = require('../../academic/enrollment/academic_year.model');
const { AppError, LogAndNormalizeGqlError } = require('../../../core/errors');
const { SendEmail } = require('../../../shared/services/email.service');
const { UserModel } = require('../../users/user/user.model');
const { NotificationLogModel } = require('./notification_log.model');

// *************** GLOBAL VARIABLES ***************

// Background notification type stored in notification logs.
const MISSING_GRADE_ALERT = 'MISSING_GRADE_ALERT';

// Error log source used by the notification log helper.
const MISSING_GRADE_AUDITOR_SOURCE = 'features/system/notifications/notification_log.helper.js';

// Minimum delay between digest email deliveries to respect SMTP testing rate limits.
const MISSING_GRADE_EMAIL_THROTTLE_MS = 1100;

// *************** HELPER FUNCTION ***************

/**
 * Logs a missing grade cron operational error without interrupting the scheduler.
 *
 * This is not a business audit trail. It writes cron failures to the shared
 * error log collection through the core GraphQL error logger, while ignoring
 * the returned GraphQL error because background jobs do not return a transport response.
 *
 * @param {Error} error - Error thrown by the background cron process.
 * @param {Object} meta - Context metadata for debugging.
 * @returns {Promise<void>}
 */
async function LogMissingGradeCronError(error, meta = null) {
  try {
    // *************** Normalize raw cron errors into operational errors before writing to error_logs
    const errorToLog =
      error instanceof AppError || error?.isOperational
        ? error
        : new AppError(
            error.code || 'MISSING_GRADE_AUDITOR_ERROR',
            error.httpStatus || 500,
            error.message || 'Missing grade auditor failed',
            meta,
          );

    if (!errorToLog.meta && meta) {
      // *************** Attach cron context so the shared logger can persist useful debugging metadata
      errorToLog.meta = meta;
    }

    if (!errorToLog.stack && error.stack) {
      // *************** Preserve the original stack when a raw error was wrapped as AppError
      errorToLog.stack = error.stack;
    }

    await LogAndNormalizeGqlError(errorToLog, {
      source: MISSING_GRADE_AUDITOR_SOURCE,
    });
  } catch (logError) {
    // *************** Keep the cron process alive even when error logging fails
    console.error('Missing grade auditor log failed:', logError);
  }
}

/**
 * Finds active academic-year student/test combinations
 * that do not yet have a matching StudentGrade document
 * and have not been successfully alerted.
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
    // *************** Join sent notification logs to avoid resending successful alerts
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
    // *************** Shape the audit result into digest-ready missing grade records
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
        subject_id: '$subject_data._id',
        subject_name: '$subject_data.name',
      },
    },
  ]);
}

/**
 * Builds a stable grouping key for one email digest.
 *
 * @param {Object} missingGrade - Missing grade aggregation result.
 * @returns {string} Digest grouping key.
 */
function BuildMissingGradeDigestKey(missingGrade) {
  // *************** Combine stable identifiers so each digest represents one academic year, subject, and test
  return [
    missingGrade.academic_year_id.toString(),
    missingGrade.subject_id.toString(),
    missingGrade.test_id.toString(),
  ].join(':');
}

/**
 * Groups missing grade records into one digest per academic year,
 * subject, and test.
 *
 * @param {Array} missingGrades - Missing grade records.
 * @returns {Array} Missing grade digest groups.
 */
function GroupMissingGradesByTest(missingGrades) {
  // *************** Store digest payloads by deterministic key to merge students into the same alert
  const digestMap = new Map();

  for (const missingGrade of missingGrades) {
    // *************** Build the grouping key for the current missing grade candidate
    const digestKey = BuildMissingGradeDigestKey(missingGrade);

    if (!digestMap.has(digestKey)) {
      // *************** Initialize a digest bucket the first time this test grouping is encountered
      digestMap.set(digestKey, {
        academic_year_id: missingGrade.academic_year_id,
        academic_year_name: missingGrade.academic_year_name,
        subject_id: missingGrade.subject_id,
        subject_name: missingGrade.subject_name,
        test_id: missingGrade.test_id,
        test_name: missingGrade.test_name,
        students: [],
      });
    }

    // *************** Append the student to the existing digest bucket for this missing test score
    digestMap.get(digestKey).students.push({
      student_id: missingGrade.student_id,
      first_name: missingGrade.student_first_name,
      last_name: missingGrade.student_last_name,
      student_number: missingGrade.student_number,
    });
  }

  // *************** Return grouped digest objects without exposing the internal lookup map
  return Array.from(digestMap.values());
}

/**
 * Escapes display text embedded in the HTML email body.
 *
 * @param {string} value - Display value.
 * @returns {string} HTML-safe display value.
 */
function EscapeHtml(value) {
  // *************** Normalize nullable values before replacing HTML-sensitive characters
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Waits for a small delay between outbound digest emails.
 *
 * @param {number} milliseconds - Delay duration.
 * @returns {Promise<void>}
 */
function Wait(milliseconds) {
  // *************** Wrap setTimeout in a promise so async audit flow can throttle sequentially
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Builds the HTML body for a missing grade digest alert.
 *
 * @param {Object} missingGradeDigest - Missing grade digest group.
 * @returns {string} HTML email body.
 */
function BuildMissingGradeDigestEmailBody(missingGradeDigest) {
  // *************** Render one escaped table row for each student missing the selected test grade
  const studentRows = missingGradeDigest.students
    .map((student, index) => {
      // *************** Build a readable name while tolerating partially empty student profiles
      const studentName = `${student.first_name} ${student.last_name}`.trim();

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${EscapeHtml(studentName)}</td>
          <td>${EscapeHtml(student.student_number)}</td>
        </tr>
      `;
    })
    .join('');

  // *************** Compose the digest email body with escaped display values and computed totals
  return `
    <h2>Missing Grade Alert</h2>
    <p>Some grade entries are missing for the active academic year.</p>
    <ul>
      <li><strong>Academic Year:</strong> ${EscapeHtml(missingGradeDigest.academic_year_name)}</li>
      <li><strong>Subject:</strong> ${EscapeHtml(missingGradeDigest.subject_name)}</li>
      <li><strong>Test:</strong> ${EscapeHtml(missingGradeDigest.test_name)}</li>
      <li><strong>Total Students:</strong> ${missingGradeDigest.students.length}</li>
    </ul>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>No</th>
          <th>Student</th>
          <th>Student Number</th>
        </tr>
      </thead>
      <tbody>
        ${studentRows}
      </tbody>
    </table>
    <p>Please submit the missing scores through the grading workflow.</p>
  `;
}

/**
 * Persists sent notification logs for every student in a digest.
 *
 * Logs are created only after the digest email is delivered successfully,
 * so failed SMTP deliveries can be retried by the next audit run.
 *
 * @param {Object} missingGradeDigest - Missing grade digest group.
 * @returns {Promise<void>}
 */
async function CreateSentMissingGradeNotificationLogs(missingGradeDigest) {
  // *************** Create one audit log per student so future cron runs can skip delivered alerts
  const notificationLogs = missingGradeDigest.students.map((student) => ({
    type: MISSING_GRADE_ALERT,
    student_id: student.student_id,
    test_id: missingGradeDigest.test_id,
    academic_year_id: missingGradeDigest.academic_year_id,
  }));

  // *************** Insert logs in order to make a partial failure easier to reason about operationally
  await NotificationLogModel.insertMany(notificationLogs, {
    ordered: true,
  });
}

/**
 * Ensures the notification log collection and indexes
 * are ready before the scheduled job starts.
 *
 * @returns {Promise<void>}
 */
async function EnsureMissingGradeAuditIndexesHelper() {
  // *************** Initialize the unique notification index before cron execution begins
  await NotificationLogModel.init();
}

/**
 * Runs the missing grade audit once.
 *
 * @returns {Promise<void>}
 */
async function RunMissingGradeAuditHelper() {
  try {
    // *************** START: Resolve teacher notification recipient ***************
    const teacherUser = await UserModel.findOne({
      role: 'teacher',
    }).select('email').lean();

    if (!teacherUser?.email) {
      // *************** Record missing recipient configuration and stop this run without throwing
      await LogMissingGradeCronError(
        new AppError('MISSING_GRADE_TEACHER_EMAIL_NOT_FOUND', 500, 'Teacher email recipient not found'),
      );
      return;
    }
    // *************** END: Resolve teacher notification recipient ***************

    // *************** START: Find and group missing grade events that have not been alerted ***************
    const missingGrades = await FindMissingGradeRecords();
    const missingGradeDigests = GroupMissingGradesByTest(missingGrades);
    // *************** END: Find and group missing grade events that have not been alerted ***************

    // *************** START: Send one digest alert per test and write logs only after success ***************
    for (let digestIndex = 0; digestIndex < missingGradeDigests.length; digestIndex += 1) {
      const missingGradeDigest = missingGradeDigests[digestIndex];

      try {
        if (digestIndex > 0) {
          // *************** Pause after the first email to avoid triggering SMTP provider rate limits
          await Wait(MISSING_GRADE_EMAIL_THROTTLE_MS);
        }

        // *************** Deliver the digest before persisting notification logs for retry correctness
        await SendEmail(
          teacherUser.email,
          `Missing grades: ${missingGradeDigest.test_name}`,
          BuildMissingGradeDigestEmailBody(missingGradeDigest),
        );

        // *************** Mark each student/test alert as sent only after the email service succeeds
        await CreateSentMissingGradeNotificationLogs(missingGradeDigest);
      } catch (notificationError) {
        // *************** Capture digest-specific context while allowing the remaining digests to continue
        await LogMissingGradeCronError(notificationError, {
          academic_year_id: missingGradeDigest.academic_year_id,
          subject_id: missingGradeDigest.subject_id,
          test_id: missingGradeDigest.test_id,
          student_ids: missingGradeDigest.students.map((student) => student.student_id),
        });
      }
    }
    // *************** END: Send one digest alert per test and write logs only after success ***************
  } catch (jobError) {
    await LogMissingGradeCronError(jobError);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  EnsureMissingGradeAuditIndexesHelper,
  RunMissingGradeAuditHelper,
};
