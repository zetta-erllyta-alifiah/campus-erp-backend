// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

// *************** GLOBAL VARIABLES ***************
/**
 * GraphQL schema definition
 * for Enrollment feature.
 *
 * Responsibilities:
 * - Define AcademicYear type.
 * - Define enrollment input.
 * - Define enrollment mutation.
 */
const typeDefs = gql`
  # Academic year entity.
  type AcademicYear {
    _id: ID!
    name: String!
    start_date: String!
    end_date: String!
    status: String!
    block_ids: [ID!]!
    student_ids: [ID!]!
    created_at: String!
    updated_at: String!
  }

  # Input payload used to
  # enroll students into
  # an academic year.
  input EnrollStudentsInput {
    academic_year_id: ID!
    student_ids: [ID!]!
  }

  type Mutation {
    # Enrolls one or more
    # students into an
    # academic year.
    EnrollStudentsToYear(input: EnrollStudentsInput!): AcademicYear! @auth(requires: ADMIN)
  }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;
