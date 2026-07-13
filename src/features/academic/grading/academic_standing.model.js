// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

// Allowed standing statuses produced by the grade aggregation worker.
const ACADEMIC_STANDING_STATUSES = ['Pass', 'Fail', 'Retake'];

/**
 * Academic standing test snapshot schema.
 *
 * Responsibility:
 * - Store the computed standing for one test
 *   inside a subject standing snapshot.
 */
const AcademicStandingTestSchema = new mongoose.Schema(
  {
    // Reference to the curriculum test being evaluated.
    test_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
    },

    // Computed mark for the test after grade aggregation.
    total_mark: {
      type: Number,
      required: true,
      default: 0,
    },

    // Computed test standing derived from the dynamic test grading rules.
    test_status: {
      type: String,
      enum: ACADEMIC_STANDING_STATUSES,
      required: true,
    },

    // Indicates whether this test had a submitted StudentGrade during aggregation.
    is_graded: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
  },
);

/**
 * Academic standing subject snapshot schema.
 *
 * Responsibility:
 * - Store the computed standing for one subject
 *   and its child test standings.
 */
const AcademicStandingSubjectSchema = new mongoose.Schema(
  {
    // Reference to the curriculum subject being evaluated.
    subject_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },

    // Computed average for the subject from child test marks.
    subject_average: {
      type: Number,
      required: true,
      default: 0,
    },

    // Computed subject standing derived from the dynamic subject grading rules.
    subject_status: {
      type: String,
      enum: ACADEMIC_STANDING_STATUSES,
      required: true,
    },

    // Computed standings for the tests that belong to this subject.
    tests: {
      type: [AcademicStandingTestSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

/**
 * Academic standing schema.
 *
 * Responsibility:
 * - Store the computed academic standing
 *   for a student within one academic year
 *   and curriculum block.
 */
const AcademicStandingSchema = new mongoose.Schema(
  {
    // Reference to the student whose standing was computed.
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // Reference to the academic year cohort for this standing.
    academic_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
    },

    // Reference to the curriculum block being evaluated.
    block_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      required: true,
    },

    // Computed average for the block from child subject averages.
    block_average: {
      type: Number,
      required: true,
      default: 0,
    },

    // Computed block standing derived from the dynamic block grading rules.
    block_status: {
      type: String,
      enum: ACADEMIC_STANDING_STATUSES,
      required: true,
    },

    // Computed standings for the subjects that belong to this block.
    subjects: {
      type: [AcademicStandingSubjectSchema],
      default: [],
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'academic_standings',
  },
);

// *************** START: Enforce one standing snapshot per student, year, and block ***************
AcademicStandingSchema.index(
  {
    student_id: 1,
    academic_year_id: 1,
    block_id: 1,
  },
  {
    unique: true,
    name: 'unique_student_academic_year_block_standing',
  },
);
// *************** END: Enforce one standing snapshot per student, year, and block ***************

/**
 * Compiled AcademicStanding model used by the worker
 * to persist computed student standing snapshots.
 */
const AcademicStandingModel = mongoose.models.AcademicStanding || mongoose.model('AcademicStanding', AcademicStandingSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  AcademicStandingModel,
};
