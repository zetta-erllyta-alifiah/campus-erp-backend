// *************** IMPORT LIBRARY ***************
const { ApolloServer } = require('@apollo/server');

/**
 * Creates and configures Apollo Server.
 *
 * @param {Object} options - Apollo configuration.
 * @param {Array} options.typeDefs - GraphQL type definitions.
 * @param {Object} options.resolvers - GraphQL resolvers.
 *
 * @returns {ApolloServer} Configured Apollo Server instance.
 */
function createApolloServer({
    typeDefs,
    resolvers,
}) {
    return new ApolloServer({
        typeDefs,
        resolvers,
    });
}

// *************** EXPORT MODULE ***************
module.exports = createApolloServer;