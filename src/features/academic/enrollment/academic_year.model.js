// *************** IMPORT LIBRARY ***************
const mongoose =
    require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Academic year schema.
 *
 * Responsibility:
 * - Define academic period.
 * - Maintain relationship
 *   with curriculum blocks.
 * - Maintain enrolled students.
 */
const AcademicYearSchema =
    new mongoose.Schema(
        {
            // Academic year name in format YYYY/YYYY.
            // Example: 2025/2026
            name: {
                type: String,
                required: true,
                trim: true,
            },

            // The date the academic year begins.
            start_date: {
                type: Date,
                required: true,
            },

            // The date the academic year ends.
            end_date: {
                type: Date,
                required: true,
            },

            // Current lifecycle status of the academic year.
            status: {
                type: String,
                enum: [
                    'active',
                    'completed',
                    'archived',
                ],
                default: 'active',
            },

            // Curriculum block references assigned to this academic year.
            block_ids: {
                type: [
                    {
                        type:
                            mongoose
                                .Schema
                                .Types
                                .ObjectId,
                        ref: 'Block',
                    },
                ],
                required: true,
            },

            // Student references enrolled in the academic year.
            student_ids: {
                type: [
                    {
                        type:
                            mongoose
                                .Schema
                                .Types
                                .ObjectId,
                        ref: 'Student',
                    },
                ],
                default: [],
            },
        },
        {
            timestamps: true,
            collection:
                'academic_years',
        },
    );

// *************** GLOBAL VARIABLES ***************

const AcademicYearModel =
    mongoose.model(
        'AcademicYear',
        AcademicYearSchema,
    );

// *************** EXPORT MODULE ***************
module.exports ={
    AcademicYearModel
};