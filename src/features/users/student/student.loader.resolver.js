// *************** LOADER RESOLVER ***************
/**
 * Resolves academic years for a student
 * using the request-scoped loader.
 *
 * @param {object} parent - Student parent object.
 * @param {object} _ - Unused GraphQL args.
 * @param {object} context - GraphQL context.
 * @returns {Promise<Array>} Academic year records.
 */
function StudentAcademicYearsLoader(parent, _, context) {
  return context.AcademicYearLoader.loadMany(parent.academic_year_ids || []);
}

// *************** EXPORT MODULE ***************
module.exports = {
  StudentAcademicYearsLoader,
};
