// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

// *************** GLOBAL VARIABLES ***************
const typeDefs = gql`
  type Query {
    ping: String!
  }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;
