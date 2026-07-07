// *************** IMPORT MODULE ***************
const { GetStudentsByAcademicYearSchema } = require('./student.validator');
const { GetStudentsByAcademicYearHelper } = require('./student.helper');
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const { NormalizeGqlError } = require('../../../core/errors');

// *************** QUERY ***************
/**
 * GraphQL query resolver
 * for fetching students by
 * academic year.
 *
 * Flow:
 * - Validate input
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
    const validatedInput = ValidateInputWithJoi(GetStudentsByAcademicYearSchema, input);

    return await GetStudentsByAcademicYearHelper(validatedInput);
  } catch (error) {
    throw NormalizeGqlError(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  GetStudentsByAcademicYearQuery,
};
