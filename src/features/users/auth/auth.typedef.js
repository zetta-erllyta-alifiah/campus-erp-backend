// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

// *************** GLOBAL VARIABLES ***************
const typeDefs = gql`
  input LoginInput {
    email: String!
    password: String!
  }

  type Mutation {
    Login(input: LoginInput!): String!
  }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;
