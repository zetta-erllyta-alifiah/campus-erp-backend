// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Notification log schema.
 *
 * Responsibility:
 * - Store background notification events.
 * - Act as an idempotency lock so the
 *   same missing grade alert is sent once.
 */
const NotificationLogSchema = new mongoose.Schema(
  {
    // Notification event type used to segment idempotency rules.
    type: {
      type: String,
      required: true,
      enum: ['MISSING_GRADE_ALERT'],
    },

    // Student involved in the notification event.
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // Test involved in the notification event.
    test_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
    },

    // Academic year involved in the notification event.
    academic_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
    },

    // Creation timestamp for the sent notification lock.
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'notification_logs',
  },
);

// *************** START: Enforce one alert per missing grade event ***************
NotificationLogSchema.index(
  {
    type: 1,
    student_id: 1,
    test_id: 1,
    academic_year_id: 1,
  },
  {
    unique: true,
    name: 'unique_notification_type_student_test_academic_year',
  },
);
// *************** END: Enforce one alert per missing grade event ***************

const NotificationLogModel =
  mongoose.models.NotificationLog || mongoose.model('NotificationLog', NotificationLogSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  NotificationLogModel,
};
