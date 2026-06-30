const { ApolloServer } = require('@apollo/server');
const systemModule = require('../features/system');

/**
 * Creates and configures the Apollo Server instance.
 *
 * @returns {ApolloServer} Configured Apollo Server.
 */
function createApolloServer() {
    return new ApolloServer({
        typeDefs: systemModule.typeDefs,
        resolvers: systemModule.resolvers,
    });
}

module.exports = createApolloServer;