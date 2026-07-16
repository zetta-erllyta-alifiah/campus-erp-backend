// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

const GRADE_AGGREGATION_JOB_STATUSES = ['queued', 'running', 'retry', 'completed', 'failed', 'cancelled'];

/**
 * Durable grade aggregation job schema.
 *
 * Responsibility:
 * - Track one background aggregation request.
 * - Provide retry and lock metadata for worker execution.
 */
const GradeAggregationJobSchema = new mongoose.Schema(
  {
    student_ids: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Student',
      required: true,
      default: [],
    },

    test_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
    },

    academic_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
    },

    block_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      required: true,
    },

    lock_key: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: GRADE_AGGREGATION_JOB_STATUSES,
      required: true,
      default: 'queued',
    },

    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    max_attempts: {
      type: Number,
      required: true,
      default: 3,
      min: 1,
    },

    next_run_at: {
      type: Date,
      required: true,
      default: Date.now,
    },

    worker_started_at: {
      type: Date,
      default: null,
    },

    completed_at: {
      type: Date,
      default: null,
    },

    last_error: {
      code: {
        type: String,
        default: null,
        trim: true,
      },
      message: {
        type: String,
        default: null,
        trim: true,
      },
    },

    last_error_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'grade_aggregation_jobs',
  },
);

GradeAggregationJobSchema.index(
  {
    status: 1,
    next_run_at: 1,
  },
  {
    name: 'idx_grade_aggregation_job_status_next_run',
  },
);

GradeAggregationJobSchema.index(
  {
    lock_key: 1,
    status: 1,
  },
  {
    unique: true,
    name: 'unique_running_grade_aggregation_lock',
    partialFilterExpression: {
      status: 'running',
    },
  },
);

const GradeAggregationJobModel =
  mongoose.models.GradeAggregationJob || mongoose.model('GradeAggregationJob', GradeAggregationJobSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  GRADE_AGGREGATION_JOB_STATUSES,
  GradeAggregationJobModel,
};
