// *************** IMPORT MODULE ***************
const typeDefs = require('./grading.typedef');
const { SubmitTestGradesMutation } = require('./grading.mutation.resolver');

// *************** GLOBAL VARIABLES ***************

/**
 * GraphQL resolver map
 * for the Grading domain.
 */
const resolvers = {
  Mutation: {
    SubmitTestGrades: SubmitTestGradesMutation,
  },
};

// *************** EXPORT MODULE ***************
module.exports = {
  typeDefs,
  resolvers,
};
