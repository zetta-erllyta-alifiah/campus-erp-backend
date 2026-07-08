// *************** IMPORT HELPER ***************
const { CreateStudentHelper } = require('./student.helper');

// *************** IMPORT UTILITIES ***************
const { LogAndNormalizeGqlError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * GraphQL mutation resolver
 * for creating a student.
 *
 * Flow:
 * - Extract payload
 * - Execute business logic
 * - Normalize errors
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateStudentMutation(_, args) {
  try {
    // *************** Extract input payload ***************
    const { input } = args;

    // *************** Execute student creation business logic ***************
    return await CreateStudentHelper(input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'CreateStudentMutation' });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateStudentMutation,
};
