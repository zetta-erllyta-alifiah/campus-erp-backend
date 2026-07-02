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
            /**
             * Academic year name.
             *
             * Example:
             * 2025/2026
             */
            name: {
                type: String,
                required: true,
                trim: true,
            },

            /**
             * Start date.
             */
            start_date: {
                type: Date,
                required: true,
            },

            /**
             * End date.
             */
            end_date: {
                type: Date,
                required: true,
            },

            /**
             * Academic year status.
             */
            status: {
                type: String,
                enum: [
                    'active',
                    'completed',
                    'archived',
                ],
                default: 'active',
            },

            /**
             * Curriculum blocks
             * assigned to this
             * academic year.
             */
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

            /**
             * Enrolled students.
             */
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