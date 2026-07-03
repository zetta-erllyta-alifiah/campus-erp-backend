// *************** IMPORT MODULE ***************
const typeDefs = require('./enrollment.typedef');

const { EnrollStudentsToYearMutation } = require('./enrollment.mutation.resolver');

// *************** GLOBAL VARIABLES ***************

/**
 * GraphQL resolver map
 * for the Enrollment domain.
 *
 * Responsibility:
 * - Register transport-layer
 *   mutation handlers.
 *
 * Business rules must remain
 * inside helper functions.
 */
const resolvers = {
  Mutation: {
    EnrollStudentsToYear: EnrollStudentsToYearMutation,
  },
};

// *************** EXPORT MODULE ***************
module.exports = {
  typeDefs,
  resolvers,
};
