// *************** IMPORT MODULE ***************
const typeDefs = require('./system.typedef');
const { Ping } = require('./system.query.resolver');

// *************** GLOBAL VARIABLES ***************
const resolvers = {
    Query: {
        ping: Ping,
    },
};

// *************** EXPORT MODULE ***************
module.exports = {
    typeDefs,
    resolvers,
};