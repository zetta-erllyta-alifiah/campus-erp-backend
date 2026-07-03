// *************** IMPORT MODULE ***************
const { AppError } =
    require('../core/errors');

/**
 * Validates payload using
 * a Joi schema.
 *
 * Responsibilities:
 * - Execute Joi validation
 * - Aggregate validation errors
 * - Throw standardized AppError
 *
 * @param {Object} schema
 * @param {Object} payload
 *
 * @returns {Object}
 *
 * @throws {AppError}
 */
function ValidateInputWithJoi(
    schema,
    payload,
) {
    const {
        error,
        value,
    } = schema.validate(
        payload,
        {
            abortEarly: false,
            stripUnknown: true,
        },
    );

    if (error) {
        throw new AppError(
            error.details
                .map(
                    detail =>
                        detail.message
                )
                .join(', '),
            'VALIDATION_ERROR',
            400,
        );
    }

    return value;
}

// *************** EXPORT MODULE ***************
module.exports = {
    ValidateInputWithJoi,
};