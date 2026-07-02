// *************** IMPORT LIBRARY ***************
const Joi = require('joi');
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Custom validator for MongoDB
 * ObjectId values.
 */
const objectIdValidator =
    Joi.string().custom(
        (
            value,
            helpers,
        ) => {
            if (
                !mongoose
                    .Types
                    .ObjectId
                    .isValid(value)
            ) {
                return helpers.error(
                    'any.invalid'
                );
            }

            return value;
        },
        'ObjectId validation',
    );

/**
 * Validation schema for creating
 * a student enrollment batch.
 *
 * Business rules:
 * - academic_year_id must be
 *   a valid MongoDB ObjectId.
 * - student_ids must contain
 *   at least one valid
 *   MongoDB ObjectId.
 */
const CreateEnrollmentValidator =
    Joi.object({
        academic_year_id:
            objectIdValidator
                .required(),

        student_ids:
            Joi.array()
                .items(
                    objectIdValidator
                )
                .min(1)
                .required(),
    });

/**
 * Validation schema for updating
 * student enrollment data.
 *
 * Business rules:
 * - student_ids must contain
 *   at least one valid
 *   MongoDB ObjectId.
 */
const UpdateEnrollmentValidator =
    Joi.object({
        student_ids:
            Joi.array()
                .items(
                    objectIdValidator
                )
                .min(1),
    }).min(1);

// *************** EXPORT MODULE ***************
module.exports = {
    CreateEnrollmentValidator,
    UpdateEnrollmentValidator,
};