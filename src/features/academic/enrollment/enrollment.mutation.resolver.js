// *************** IMPORT MODULE ***************
const { EnrollStudentsHelper } = require('./enrollment.helper');

const { CreateEnrollmentValidator } = require('./enrollment.validator');

const { ValidateInputWithJoi } = require('../../../shared/validators/validator');

const { NormalizeGqlError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * GraphQL mutation resolver
 * for enrolling students
 * into an academic year.
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
async function EnrollStudentsToYearMutation(_, args) {
  try {
    // *************** START: Extract payload ***************
    const { input } = args;
    // *************** END: Extract payload ***************

    // *************** START: Validate payload ***************
    ValidateInputWithJoi(CreateEnrollmentValidator, input);
    // *************** END: Validate payload ***************

    // *************** START: Execute business logic ***************
    return await EnrollStudentsHelper(input);
    // *************** END: Execute business logic ***************
  } catch (error) {
    throw NormalizeGqlError(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  EnrollStudentsToYearMutation,
};
