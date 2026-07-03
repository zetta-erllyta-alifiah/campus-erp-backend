// *************** IMPORT MODULE ***************
const typeDefs = require('./student.typedef');

const { CreateStudentMutation } = require('./student.mutation.resolver');

// *************** GLOBAL VARIABLES ***************

/**
 * GraphQL resolver map
 * for the Student domain.
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
    CreateStudent: CreateStudentMutation,
  },
};

// *************** EXPORT MODULE ***************
module.exports = {
  typeDefs,
  resolvers,
};
