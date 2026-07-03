// *************** IMPORT MODULE ***************
const { CreateStudentHelper } = require('./student.helper');

const { CreateStudentValidator } = require('./student.validator');

const { ValidateInputWithJoi } = require('../../../shared/validators/validator');

const { NormalizeGqlError } = require('../../../core/errors');

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
async function CreateStudentMutation(_, args) {
  try {
    // *************** START: Extract payload ***************
    const { input } = args;
    // *************** END: Extract payload ***************

    // *************** START: Validate and sanitize payload ***************
    const validatedInput = ValidateInputWithJoi(CreateStudentValidator, input);
    // *************** END: Validate and sanitize payload ***************

    // *************** START: Execute business logic ***************
    return await CreateStudentHelper(validatedInput);
    // *************** END: Execute business logic ***************
  } catch (error) {
    throw NormalizeGqlError(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateStudentMutation,
};
