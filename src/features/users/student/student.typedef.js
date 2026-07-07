// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

// *************** GLOBAL VARIABLES ***************
/**
 * GraphQL schema definition
 * for Student feature.
 *
 * Responsibilities:
 * - Define Student object type.
 * - Define Student input types.
 * - Define Student mutations.
 */
const typeDefs = gql`
  """
  Student profile.
  """
  type Student {
    _id: ID!
    first_name: String!
    last_name: String!
    email: String!
    student_number: String!
    registration_date: String!
    academic_year_ids: [ID!]!
    academic_years: [AcademicYear!]!
    created_at: String!
    updated_at: String!
  }

  type PaginatedStudentResponse {
    total_count: Int!
    current_page: Int!
    total_pages: Int!
    data: [Student]!
  }

  input GetStudentsByAcademicYearInput {
    academic_year_id: ID!
    page: Int
    limit: Int
    search: String
  }

  extend type Query {
    GetStudentsByAcademicYear(input: GetStudentsByAcademicYearInput!): PaginatedStudentResponse!
  }

  """
  Input payload used to
  create a student.
  """
  input CreateStudentInput {
    first_name: String!
    last_name: String!
    email: String!
    student_number: String!
  }

  type Mutation {
    """
    Creates a new student.
    """
    CreateStudent(input: CreateStudentInput!): Student!
  }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;
