// *************** IMPORT HELPER FUNCTION ***************
const { SubmitTestGradesHelper } = require('./grading.helper');

// *************** IMPORT UTILITIES ***************
const { LogAndNormalizeGqlError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * GraphQL mutation resolver
 * for submitting test grades.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Array>}
 */
async function SubmitTestGradesMutation(_, args) {
  try {
    // *************** Extract input payload ***************
    const { input } = args;

    // *************** Execute grading business logic ***************
    return await SubmitTestGradesHelper(input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'SubmitTestGradesMutation' });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  SubmitTestGradesMutation,
};
