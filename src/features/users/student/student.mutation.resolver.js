// *************** IMPORT MODULE ***************
const {
    CreateStudentHelper,
    DeleteStudentHelper,
} = require(
    './student.helper'
);

const {
    CreateStudentValidator,
} = require(
    './student.validator'
);

const {
    ValidateInputWithJoi,
} = require(
    '../../../shared/validator'
);

const {
    NormalizeGqlError,
} = require(
    '../../../core/errors'
);

// *************** MUTATION ***************

/**
 * GraphQL mutation resolver
 * for creating a student.
 *
 * Flow:
 * - Extract payload
 * - Validate input
 * - Execute business logic
 * - Normalize errors
 *
 * @param {Object} _
 * @param {Object} args
 *
 * @returns {Promise<Object>}
 */
async function CreateStudentMutation(
    _,
    args,
) {
    try {
        // *************** START: Extract payload ***************
        const { input } =
            args;
        // *************** END: Extract payload ***************

        // *************** START: Validate payload***************
        ValidateInputWithJoi(
            CreateStudentValidator,
            input,
        );
        // *************** END: Validate payload ***************

        // *************** START: Execute business logic ***************
        return await CreateStudentHelper(
            input,
        );
        // *************** END: Execute business logic ***************
    } catch (error) {
        throw NormalizeGqlError(
            error,
        );
    }
}

// *************** EXPORT MODULE ***************
module.exports = {
    CreateStudentMutation,
};