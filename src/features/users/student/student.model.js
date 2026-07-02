// *************** IMPORT LIBRARY ***************
const mongoose =
    require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Student schema.
 *
 * Responsibility:
 * - Store student profile data.
 * - Maintain bidirectional relationship
 *   with AcademicYear.
 */
const StudentSchema =
    new mongoose.Schema(
        {
            /**
             * Student first name.
             */
            first_name: {
                type: String,
                required: true,
                trim: true,
            },

            /**
             * Student last name.
             */
            last_name: {
                type: String,
                required: true,
                trim: true,
            },

            /**
             * Unique student email.
             */
            email: {
                type: String,
                required: true,
                unique: true,
                trim: true,
                lowercase: true,
            },

            /**
             * Unique student number.
             *
             * Example:
             * ZB-2026-001
             */
            student_number: {
                type: String,
                required: true,
                unique: true,
                trim: true,
            },

            /**
             * Registration date.
             */
            registration_date: {
                type: Date,
                default: Date.now,
            },

            /**
             * Academic years
             * in which the student
             * is enrolled.
             */
            academic_year_ids: {
                type: [
                    {
                        type:
                            mongoose
                                .Schema
                                .Types
                                .ObjectId,
                        ref:
                            'AcademicYear',
                    },
                ],
                default: [],
            },
        },
        {
            timestamps: true,
        },
    );

// *************** GLOBAL VARIABLES ***************

const StudentModel =
    mongoose.model(
        'Student',
        StudentSchema,
    );

// *************** EXPORT MODULE ***************
module.exports = {
    StudentModel,
};