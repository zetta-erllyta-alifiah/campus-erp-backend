// *************** IMPORT LIBRARY ***************
const { ApolloServer } = require('@apollo/server');
const { makeExecutableSchema } = require('@graphql-tools/schema');

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
      return formattedError;
    },
  });
}

// *************** EXPORT MODULE ***************
module.exports = CreateApolloServer;
