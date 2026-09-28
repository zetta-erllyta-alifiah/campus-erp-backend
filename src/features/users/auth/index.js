// *************** IMPORT MODULE ***************
const typeDefs = require('./auth.typedef');
const { LoginMutation } = require('./auth.mutation.resolver');

// *************** GLOBAL VARIABLES ***************
const resolvers = {
  Mutation: {
    Login: LoginMutation,
  },
};

// *************** EXPORT MODULE ***************
module.exports = {
  typeDefs,
  resolvers,
};
