// *************** IMPORT LIBRARY ***************
const {
    ApolloServer,
} = require('@apollo/server');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Creates and configures an Apollo Server instance.
 *
 * @param {Object} apolloServerConfiguration - Apollo Server configuration.
 * @param {Array} apolloServerConfiguration.typeDefs - GraphQL type definitions.
 * @param {Object} apolloServerConfiguration.resolvers - GraphQL resolvers.
 *
 * @returns {ApolloServer} Configured Apollo Server instance.
 */
function CreateApolloServer({
    typeDefs,
    resolvers,
}) {
    return new ApolloServer({
        typeDefs,
        resolvers,
    });
}

// *************** EXPORT MODULE ***************
module.exports =
    CreateApolloServer;