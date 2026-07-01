// *************** IMPORT LIBRARY ***************
const { gql } = require('graphql-tag');

// *************** GLOBAL VARIABLES ***************
const typeDefs = gql`
    type GradingRule {
        label: String!
        operator: String!
        threshold: Float!
    }

    type Block {
        _id: ID!
        name: String!
        academic_year: String!
        grading_rules: [GradingRule!]!
        createdAt: String!
        updatedAt: String!
    }

    type Subject {
        _id: ID!
        name: String!
        block_id: ID!
        weightage: Float!
        grading_rules: [GradingRule!]!
        createdAt: String!
        updatedAt: String!
    }

    type Test {
        _id: ID!
        name: String!
        subject_id: ID!
        weightage: Float!
        grading_rules: [GradingRule!]!
        createdAt: String!
        updatedAt: String!
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
        CreateBlock(
            input: CreateBlockInput!
        ): Block!

        UpdateBlock(
            block_id: ID!
            input: UpdateBlockInput!
        ): Block!

        DeleteBlock(
            block_id: ID!
        ): Boolean!

        CreateSubject(
            input: CreateSubjectInput!
        ): Subject!

        UpdateSubject(
            subject_id: ID!
            input: UpdateSubjectInput!
        ): Subject!

        DeleteSubject(
            subject_id: ID!
        ): Boolean!

        CreateTest(
            input: CreateTestInput!
        ): Test!

        UpdateTest(
            test_id: ID!
            input: UpdateTestInput!
        ): Test!

        DeleteTest(
            test_id: ID!
        ): Boolean!
    }
`;

// *************** EXPORT MODULE ***************
module.exports = typeDefs;