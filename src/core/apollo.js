// *************** IMPORT LIBRARY ***************
const { ApolloServer } = require('@apollo/server');
const { makeExecutableSchema } = require('@graphql-tools/schema');

// *************** IMPORT MODULE ***************
const { AppError } = require('./errors');

/**
 * Creates and configures Apollo Server.
 * @param {Object} options
 * @returns {ApolloServer}
 */
function CreateApolloServer(options) {
  const schema = options.schema || makeExecutableSchema({
    typeDefs: options.typeDefs,
    resolvers: options.resolvers,
  });

  return new ApolloServer({
    schema,

    formatError(formattedError, error) {
      const originalError = error.originalError;

      if (originalError instanceof AppError) {
        return {
          message: originalError.message,
          extensions: {
            code: originalError.code,
            httpStatus: originalError.httpStatus,
            meta: originalError.meta,
          },
        };
      }

      return formattedError;
    },
  });
}

// *************** EXPORT MODULE ***************
module.exports = CreateApolloServer;
