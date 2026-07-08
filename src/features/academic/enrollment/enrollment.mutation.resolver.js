// *************** IMPORT HELPER ***************
const { EnrollStudentsHelper } = require('./enrollment.helper');

// *************** IMPORT UTILITIES ***************
const { LogAndNormalizeGqlError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * GraphQL mutation resolver
 * for enrolling students
 * into an academic year.
 *
 * Flow:
 * - Extract payload
 * - Execute business logic
 * - Normalize errors
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function EnrollStudentsToYearMutation(_, args) {
  try {
    // *************** Extract input payload ***************
    const { input } = args;

    // *************** Execute enrollment business logic ***************
    return await EnrollStudentsHelper(input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'EnrollStudentsToYearMutation' });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  EnrollStudentsToYearMutation,
};
