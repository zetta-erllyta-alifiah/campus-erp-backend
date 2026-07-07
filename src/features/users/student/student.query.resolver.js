// *************** IMPORT HELPER ***************
const { GetStudentsByAcademicYearHelper } = require('./student.helper');

// *************** IMPORT UTILITIES ***************
const { NormalizeGqlError } = require('../../../core/errors');

// *************** QUERY ***************
/**
 * GraphQL query resolver
 * for fetching students by
 * academic year.
 *
 * Flow:
 * - Execute aggregation helper
 * - Return paginated payload
 *
 * @param {Object} _ - GraphQL root value.
 * @param {Object} args - GraphQL query arguments.
 * @returns {Promise<Object>} Paginated student response.
 */
async function GetStudentsByAcademicYearQuery(_, args) {
  try {
    const { input } = args;

    return await GetStudentsByAcademicYearHelper(input);
  } catch (error) {
    throw NormalizeGqlError(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  GetStudentsByAcademicYearQuery,
};
