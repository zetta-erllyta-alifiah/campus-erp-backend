// *************** IMPORT MODULE ***************
const typeDefs =
    require('./curriculum.typedef');

const {
    CreateBlockMutation,
    UpdateBlockMutation,
    DeleteBlockMutation,

    CreateSubjectMutation,
    UpdateSubjectMutation,
    DeleteSubjectMutation,

    CreateTestMutation,
    UpdateTestMutation,
    DeleteTestMutation,
} = require(
    './curriculum.mutation.resolver'
);

// *************** GLOBAL VARIABLES ***************
/**
 * Curriculum GraphQL resolvers.
 *
 * Contains all mutation resolvers
 * related to academic curriculum
 * management, including:
 * - Block management
 * - Subject management
 * - Test management
 *
 * @type {Object}
 */
const resolvers = {
    Mutation: {
        // Block mutations
        CreateBlock:
            CreateBlockMutation,

        UpdateBlock:
            UpdateBlockMutation,

        DeleteBlock:
            DeleteBlockMutation,

        // Subject mutations
        CreateSubject:
            CreateSubjectMutation,

        UpdateSubject:
            UpdateSubjectMutation,

        DeleteSubject:
            DeleteSubjectMutation,

        // Test mutations
        CreateTest:
            CreateTestMutation,

        UpdateTest:
            UpdateTestMutation,

        DeleteTest:
            DeleteTestMutation,
    },
};

// *************** EXPORT MODULE ***************
module.exports = {
    typeDefs,
    resolvers,
};