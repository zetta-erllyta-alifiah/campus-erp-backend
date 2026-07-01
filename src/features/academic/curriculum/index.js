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
const resolvers = {
    Mutation: {
        CreateBlock:
            CreateBlockMutation,

        UpdateBlock:
            UpdateBlockMutation,

        DeleteBlock:
            DeleteBlockMutation,

        CreateSubject:
            CreateSubjectMutation,

        UpdateSubject:
            UpdateSubjectMutation,

        DeleteSubject:
            DeleteSubjectMutation,

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