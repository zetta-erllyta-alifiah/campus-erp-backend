// *************** IMPORT MODULE ***************
const { CreateStudentHelper } = require('./student.helper');
const { NormalizeGqlError } = require('../../../core/errors');

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
    throw NormalizeGqlError(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateStudentMutation,
};
