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

const { ValidateInputWithJoi } = require('../../../shared/validators/validator');

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
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateBlockMutation(_, { input }) {
  const validatedInput = ValidateInputWithJoi(CreateBlockValidator, input);

  return CreateBlock(validatedInput);
}

/**
 * Updates a curriculum block.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateBlockMutation(_, { block_id, input }) {
  const validatedId = ValidateInputWithJoi(BlockIdValidator, { block_id });
  const validatedInput = ValidateInputWithJoi(UpdateBlockValidator, input);

  return UpdateBlock(validatedId.block_id, validatedInput);
}

/**
 * Deletes a curriculum block.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteBlockMutation(_, { block_id }) {
  const validatedId = ValidateInputWithJoi(BlockIdValidator, { block_id });

  return DeleteBlock(validatedId.block_id);
}

/**
 * Creates a subject.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateSubjectMutation(_, { input }) {
  const validatedInput = ValidateInputWithJoi(CreateSubjectValidator, input);

  return CreateSubject(validatedInput);
}

/**
 * Updates a subject.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateSubjectMutation(_, { subject_id, input }) {
  const validatedId = ValidateInputWithJoi(SubjectIdValidator, { subject_id });
  const validatedInput = ValidateInputWithJoi(UpdateSubjectValidator, input);

  return UpdateSubject(validatedId.subject_id, validatedInput);
}

/**
 * Deletes a subject.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteSubjectMutation(_, { subject_id }) {
  const validatedId = ValidateInputWithJoi(SubjectIdValidator, { subject_id });

  return DeleteSubject(validatedId.subject_id);
}

/**
 * Creates a test.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateTestMutation(_, { input }) {
  const validatedInput = ValidateInputWithJoi(CreateTestValidator, input);

  return CreateTest(validatedInput);
}

/**
 * Updates a test.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateTestMutation(_, { test_id, input }) {
  const validatedId = ValidateInputWithJoi(TestIdValidator, { test_id });

  const validatedInput = ValidateInputWithJoi(UpdateTestValidator, input);

  return UpdateTest(validatedId.test_id, validatedInput);
}

/**
 * Deletes a test.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteTestMutation(_, { test_id }) {
  const validatedId = ValidateInputWithJoi(TestIdValidator, { test_id });

  return DeleteTest(validatedId.test_id);
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
