// *************** IMPORT MODULE ***************
const {
    CreateBlockValidator,
    UpdateBlockValidator,

    CreateSubjectValidator,
    UpdateSubjectValidator,

    CreateTestValidator,
    UpdateTestValidator,

    BlockIdValidator,
    SubjectIdValidator,
    TestIdValidator,
} = require('./curriculum.validator');

const {
    ValidateInputWithJoi,
} = require(
    '../../../core/validator'
);

const {
    CreateBlock,
    UpdateBlock,
    DeleteBlock,
    CreateSubject,
    UpdateSubject,
    DeleteSubject,
    CreateTest,
    UpdateTest,
    DeleteTest,
} = require('./curriculum.helper');

// *************** MUTATION ***************

/**
 * Creates a curriculum block.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateBlockMutation(
    _,
    { input },
) {
    ValidateInputWithJoi(
        CreateBlockValidator,
        input,
    );

    return CreateBlock(
        input
    );
}

/**
 * Updates a curriculum block.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateBlockMutation(
    _,
    {
        block_id,
        input,
    },
) {
    ValidateInputWithJoi(
        BlockIdValidator,
        { block_id },
    );

    ValidateInputWithJoi(
        UpdateBlockValidator,
        input,
    );

    return UpdateBlock(
        block_id,
        input,
    );
}

/**
 * Deletes a curriculum block.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteBlockMutation(
    _,
    { block_id },
) {
    ValidateInputWithJoi(
        BlockIdValidator,
        { block_id },
    );

    return DeleteBlock(
        block_id,
    );
}

/**
 * Creates a subject.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateSubjectMutation(
    _,
    { input },
) {
    ValidateInputWithJoi(
        CreateSubjectValidator,
        input,
    );

    return CreateSubject(
        input,
    );
}

/**
 * Updates a subject.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateSubjectMutation(
    _,
    {
        subject_id,
        input,
    },
) {
    ValidateInputWithJoi(
        SubjectIdValidator,
        { subject_id },
    );

    ValidateInputWithJoi(
        UpdateSubjectValidator,
        input,
    );

    return UpdateSubject(
        subject_id,
        input,
    );
}

/**
 * Deletes a subject.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteSubjectMutation(
    _,
    { subject_id },
) {
    ValidateInputWithJoi(
        SubjectIdValidator,
        { subject_id },
    );

    return DeleteSubject(
        subject_id,
    );
}

/**
 * Creates a test.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateTestMutation(
    _,
    { input },
) {
    ValidateInputWithJoi(
        CreateTestValidator,
        input,
    );

    return CreateTest(
        input,
    );
}

/**
 * Updates a test.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateTestMutation(
    _,
    {
        test_id,
        input,
    },
) {
    ValidateInputWithJoi(
        TestIdValidator,
        { test_id },
    );

    ValidateInputWithJoi(
        UpdateTestValidator,
        input,
    );

    return UpdateTest(
        test_id,
        input,
    );
}

/**
 * Deletes a test.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteTestMutation(
    _,
    { test_id },
) {
    ValidateInputWithJoi(
        TestIdValidator,
        { test_id },
    );

    return DeleteTest(
        test_id,
    );
}

// *************** EXPORT MODULE ***************
module.exports = {
    CreateBlockMutation,
    UpdateBlockMutation,
    DeleteBlockMutation,

    CreateSubjectMutation,
    UpdateSubjectMutation,
    DeleteSubjectMutation,

    CreateTestMutation,
    UpdateTestMutation,
    DeleteTestMutation,
};