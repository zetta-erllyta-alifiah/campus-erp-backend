// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

// Official report card lifecycle states.
const REPORT_CARD_STATUSES = ['final', 'superseded'];

/**
 * Report card schema.
 *
 * Responsibility:
 * - Store versioned official immutable report card HTML snapshots.
 * - Preserve lifecycle, integrity, and audit data for issued reports.
 */
const ReportCardSchema = new mongoose.Schema(
  {
    // Reference to the student whose official report card was issued.
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      immutable: true,
    },

    // Reference to the academic year represented by the report card.
    academic_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
      immutable: true,
    },

    // Monotonic document version retained across corrections and reissuance.
    version: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
    },

    // Lifecycle status distinguishing the current final record from superseded history.
    status: {
      type: String,
      enum: REPORT_CARD_STATUSES,
      required: true,
      default: 'final',
    },

    // Timestamp when the report card became the official record.
    finalized_at: {
      type: Date,
      required: true,
      immutable: true,
    },

    // Authenticated administrator that issued this immutable report card version.
    finalized_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },

    // Previous report card version replaced by this corrected official version.
    supersedes_report_card_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReportCard',
      default: null,
      immutable: true,
    },

    // Academic standing snapshots used to create the immutable report card.
    source_standing_ids: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AcademicStanding',
        },
      ],
      required: true,
      default: [],
      immutable: true,
    },

    // Structured student, academic year, and standing data frozen at issuance.
    snapshot_data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
    },

    // Stable file name returned in the Content-Disposition header.
    file_name: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    // Fully rendered immutable HTML used for every future PDF download.
    html_content: {
      type: String,
      required: true,
      immutable: true,
    },

    // SHA-256 digest used to detect changes to the persisted HTML snapshot.
    content_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      immutable: true,
    },

    // Template revision used to render this official report card snapshot.
    template_version: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'report_cards',
  },
);

// *************** START: Enforce immutable report card version constraints ***************
ReportCardSchema.index(
  {
    student_id: 1,
    academic_year_id: 1,
    version: 1,
  },
  {
    unique: true,
    name: 'unique_student_academic_year_report_card_version',
  },
);

ReportCardSchema.index(
  {
    student_id: 1,
    academic_year_id: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: 'final',
    },
    name: 'unique_final_student_academic_year_report_card',
  },
);
// *************** END: Enforce immutable report card version constraints ***************

/**
 * Compiled model for immutable versioned report card records.
 */
const ReportCardModel = mongoose.models.ReportCard || mongoose.model('ReportCard', ReportCardSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  ReportCardModel,
};
