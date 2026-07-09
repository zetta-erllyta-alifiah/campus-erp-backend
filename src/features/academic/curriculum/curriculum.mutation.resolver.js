// *************** IMPORT HELPER ***************
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

// *************** IMPORT UTILITIES ***************
const { LogAndNormalizeGqlError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * Creates a curriculum block.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateBlockMutation(_, { input }) {
  try {
    return await CreateBlock(input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'CreateBlockMutation' });
  }
}

/**
 * Updates a curriculum block.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateBlockMutation(_, { block_id, input }) {
  try {
    return await UpdateBlock(block_id, input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'UpdateBlockMutation' });
  }
}

/**
 * Deletes a curriculum block.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteBlockMutation(_, { block_id }) {
  try {
    return await DeleteBlock(block_id);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'DeleteBlockMutation' });
  }
}

/**
 * Creates a subject.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateSubjectMutation(_, { input }) {
  try {
    return await CreateSubject(input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'CreateSubjectMutation' });
  }
}

/**
 * Updates a subject.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateSubjectMutation(_, { subject_id, input }) {
  try {
    return await UpdateSubject(subject_id, input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'UpdateSubjectMutation' });
  }
}

/**
 * Deletes a subject.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteSubjectMutation(_, { subject_id }) {
  try {
    return await DeleteSubject(subject_id);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'DeleteSubjectMutation' });
  }
}

/**
 * Creates a test.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function CreateTestMutation(_, { input }) {
  try {
    return await CreateTest(input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'CreateTestMutation' });
  }
}

/**
 * Updates a test.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function UpdateTestMutation(_, { test_id, input }) {
  try {
    return await UpdateTest(test_id, input);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'UpdateTestMutation' });
  }
}

/**
 * Deletes a test.
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<Boolean>}
 */
async function DeleteTestMutation(_, { test_id }) {
  try {
    return await DeleteTest(test_id);
  } catch (error) {
    throw await LogAndNormalizeGqlError(error, { source: 'DeleteTestMutation' });
  }
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
