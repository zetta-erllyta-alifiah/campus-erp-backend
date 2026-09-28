// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Student grade schema.
 *
 * Responsibility:
 * - Store immutable test scores.
 * - Prevent duplicate grades for
 *   the same student, test, and
 *   academic year combination.
 */
const StudentGradeSchema = new mongoose.Schema(
  {
    // Reference to the student who received this immutable test grade.
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // Reference to the curriculum test that produced this score.
    test_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
    },

    // Reference to the academic year cohort that owns this grading record.
    academic_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
    },

    // Numeric score awarded for the test, constrained to the institutional 0-100 scale.
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'student_grades',
  },
);

// *************** START: Enforce one grade per student, test, and academic year ***************

StudentGradeSchema.index(
  {
    student_id: 1,
    test_id: 1,
    academic_year_id: 1,
  },
  {
    unique: true,
    name: 'unique_student_test_academic_year_grade',
  },
);
// *************** END: Enforce one grade per student, test, and academic year ***************

const StudentGradeModel = mongoose.models.StudentGrade || mongoose.model('StudentGrade', StudentGradeSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  StudentGradeModel,
};
