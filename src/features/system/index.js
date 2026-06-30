const typeDefs = require('./system.typedef');
const { Ping } = require('./system.query.resolver');

module.exports = {
    typeDefs,
    resolvers: {
        Query: {
            ping: Ping,
        },
    },
};