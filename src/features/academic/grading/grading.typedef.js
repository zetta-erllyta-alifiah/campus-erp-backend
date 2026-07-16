// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

// *************** GLOBAL VARIABLES ***************

/**
 * GraphQL schema definition
 * for academic grading.
 */
const typeDefs = gql`
  # Immutable student score for a curriculum test
  type StudentGrade {
    _id: ID!
    student_id: ID!
    test_id: ID!
    academic_year_id: ID!
    score: Float!
    created_at: String!
    updated_at: String!
  }

  input StudentScoreInput {
    student_id: ID!
    score: Float!
  }

  input SubmitTestGradesInput {
    academic_year_id: ID!
    test_id: ID!
    # Maximum 100 grade rows per mutation; split larger cohorts into controlled batches.
    grades: [StudentScoreInput!]!
  }

  type Mutation {
    SubmitTestGrades(input: SubmitTestGradesInput!): [StudentGrade!]! @auth(requires: TEACHER)
  }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;
