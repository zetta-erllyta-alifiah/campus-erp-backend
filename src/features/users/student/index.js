// *************** IMPORT MODULE ***************
const typeDefs = require('./student.typedef');
const { CreateStudentMutation } = require('./student.mutation.resolver');
const { GetStudentsByAcademicYearQuery } = require('./student.query.resolver');

// *************** RESOLVERS ***************

/**
 * GraphQL resolver map
 * for the Student domain.
 *
 * Responsibility:
 * - Register transport-layer
 *   mutation and query handlers.
 * - Register type-level resolvers.
 *
 * Business rules must remain
 * inside helper functions.
 */
const resolvers = {
  Query: {
    GetStudentsByAcademicYear: GetStudentsByAcademicYearQuery,
  },
  Mutation: {
    CreateStudent: CreateStudentMutation,
  },
  Student: {
    academic_years(parent, _, context) {
      return context.AcademicYearLoader.loadMany(parent.academic_year_ids || []);
    },
  },
};

// *************** EXPORT MODULE ***************
module.exports = {
  typeDefs,
  resolvers,
};
