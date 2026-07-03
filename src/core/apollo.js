// *************** IMPORT LIBRARY ***************
const { ApolloServer } = require('@apollo/server');

// *************** IMPORT MODULE ***************
const { AppError } = require('./errors');

/**
 * Creates and configures Apollo Server.
 * @param {Object} options
 * @returns {ApolloServer}
 */
function CreateApolloServer(options) {
  return new ApolloServer({
    typeDefs: options.typeDefs,
    resolvers: options.resolvers,

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
