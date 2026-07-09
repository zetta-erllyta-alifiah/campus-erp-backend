// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

/**
 * Curriculum GraphQL schema definitions.
 *
 * This file defines:
 * - GraphQL object types
 * - GraphQL input types
 * - Curriculum mutations
 *
 * Naming conventions:
 * - Mutation names use PascalCase
 * - Field names use snake_case
 */

const typeDefs = gql`
  # Shared grading rule object
  type GradingRule {
    label: String!
    operator: String!
    threshold: Float!
  }

  # Academic block entity
  type Block {
    _id: ID!
    name: String!
    academic_year: String!
    grading_rules: [GradingRule!]!
    created_at: String!
    updated_at: String!
  }

  # Subject entity that belongs to a block
  type Subject {
    _id: ID!
    name: String!
    block_id: ID!
    weightage: Float!
    grading_rules: [GradingRule!]!
    created_at: String!
    updated_at: String!
  }

  # Test entity that belongs to a subject
  type Test {
    _id: ID!
    name: String!
    subject_id: ID!
    weightage: Float!
    grading_rules: [GradingRule!]!
    created_at: String!
    updated_at: String!
  }

  input GradingRuleInput {
    label: String!
    operator: String!
    threshold: Float!
  }

  input CreateBlockInput {
    name: String!
    academic_year: String!
    grading_rules: [GradingRuleInput!]
  }

  input UpdateBlockInput {
    name: String
    academic_year: String
    grading_rules: [GradingRuleInput!]
  }

  input CreateSubjectInput {
    name: String!
    block_id: ID!
    weightage: Float!
    grading_rules: [GradingRuleInput!]
  }

  input UpdateSubjectInput {
    name: String
    weightage: Float
    grading_rules: [GradingRuleInput!]
  }

  input CreateTestInput {
    name: String!
    subject_id: ID!
    weightage: Float!
    grading_rules: [GradingRuleInput!]
  }

  input UpdateTestInput {
    name: String
    weightage: Float
    grading_rules: [GradingRuleInput!]
  }

  type Mutation {
    CreateBlock(input: CreateBlockInput!): Block! @auth(requires: ADMIN)
    UpdateBlock(block_id: ID!, input: UpdateBlockInput!): Block! @auth(requires: ADMIN)
    DeleteBlock(block_id: ID!): Boolean! @auth(requires: ADMIN)
    CreateSubject(input: CreateSubjectInput!): Subject! @auth(requires: TEACHER)
    UpdateSubject(subject_id: ID!, input: UpdateSubjectInput!): Subject! @auth(requires: TEACHER)
    DeleteSubject(subject_id: ID!): Boolean! @auth(requires: TEACHER)
    CreateTest(input: CreateTestInput!): Test! @auth(requires: TEACHER)
    UpdateTest(test_id: ID!, input: UpdateTestInput!): Test! @auth(requires: TEACHER)
    DeleteTest(test_id: ID!): Boolean! @auth(requires: TEACHER)
  }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;
