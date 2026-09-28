/**
 * Curriculum business logic layer.
 *
 * This file contains all curriculum-related
 * business rules and mutations for:
 * - Block
 * - Subject
 * - Test
 *
 * Business rules implemented:
 * - Maximum weightage validation (100%)
 * - Parent-child relationship validation
 * - Relational grade locking
 * - Hierarchical deletion protection
 */

// *************** IMPORT MODULE ***************
const { AppError } = require('../../../core/errors');
const { BlockModel, SubjectModel, TestModel } = require('./curriculum.model');
const { StudentGradeModel } = require('../grading/student_grade.model');
const { AcademicYearModel } = require('../enrollment/academic_year.model');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');

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

// *************** HELPER FUNCTION ***************

/**
 * Validates that the accumulated
 * weightage does not exceed 100%.
 *
 * Business rule:
 * - Total weightage of siblings
 *   plus incoming weightage
 *   must be <= 100%.
 * @param {number} currentWeightage
 * @param {number} incomingWeightage
 * @returns {void}
 * @throws {AppError}
 */
function ValidateWeightageLimit(currentWeightage, incomingWeightage) {
  // *************** Normalize decimal precision before enforcing the 100% limit
  const totalWeightage = Math.round((currentWeightage + incomingWeightage) * 100) / 100;

  // *************** Reject sibling totals that would exceed the curriculum weightage cap
  if (totalWeightage > 100) {
    throw new AppError('WEIGHTAGE_LIMIT_EXCEEDED', 400, 'Total weightage exceeds 100%');
  }
}

/**
 * Validates whether an entity is locked by
 * existing student grades.
 *
 * Business rule:
 * - Once a grade exists for a Block,
 *   Subject, or Test, the entity
 *   cannot be updated or deleted.
 * @param {string} entityType
 * @param {string} entityId
 * @returns {Promise<void>}
 * @throws {AppError}
 */
async function ValidateGradeLock(entityType, entityId) {
  let lockedTestIds = [];

  // *************** Resolve the related test ids for the entity being changed
  switch (entityType) {
    case 'BLOCK': {
      const subjects = await SubjectModel.find({
        block_id: entityId,
      }).select('_id').lean();

      const subjectIds = subjects.map((subject) => subject._id);

      if (subjectIds.length === 0) {
        return;
      }

      const tests = await TestModel.find({
        subject_id: {
          $in: subjectIds,
        },
      }).select('_id').lean();

      lockedTestIds = tests.map((test) => test._id);
      break;
    }

    case 'SUBJECT': {
      const tests = await TestModel.find({
        subject_id: entityId,
      }).select('_id').lean();

      lockedTestIds = tests.map((test) => test._id);
      break;
    }

    case 'TEST':
      lockedTestIds = [entityId];
      break;
  }

  if (lockedTestIds.length === 0) {
    return;
  }

  // *************** Check whether any submitted grade already depends on this entity
  const existingGrade = await StudentGradeModel.exists({
    test_id: {
      $in: lockedTestIds,
    },
  });

  // *************** Prevent structural changes once grade data exists
  if (existingGrade) {
    throw new AppError('ENTITY_LOCKED_GRADES_EXIST', 409, 'Entity locked');
  }
}

/**
 * Finds an academic year by identifier.
 *
 * @param {string} academicYearId - Academic year identifier stored on the block.
 * @returns {Promise<Object>} Matching academic year document.
 * @throws {AppError}
 */
async function FindAcademicYearById(academicYearId) {
  const academicYear = await AcademicYearModel.findById(academicYearId);

  if (!academicYear) {
    throw new AppError('ACADEMIC_YEAR_NOT_FOUND', 404, 'Academic year not found');
  }

  return academicYear;
}

/**
 * Adds a block reference to the matching academic year.
 *
 * @param {string} academicYearId - Academic year identifier stored on the block.
 * @param {Object} blockId - Block identifier to attach.
 * @returns {Promise<void>}
 */
async function AddBlockToAcademicYear(academicYearId, blockId) {
  await AcademicYearModel.updateOne(
    {
      _id: academicYearId,
    },
    {
      $addToSet: {
        block_ids: blockId,
      },
    },
  );
}

/**
 * Removes a block reference from the matching academic year.
 *
 * @param {string} academicYearId - Academic year identifier stored on the block.
 * @param {Object} blockId - Block identifier to detach.
 * @returns {Promise<void>}
 */
async function RemoveBlockFromAcademicYear(academicYearId, blockId) {
  await AcademicYearModel.updateOne(
    {
      _id: academicYearId,
    },
    {
      $pull: {
        block_ids: blockId,
      },
    },
  );
}

// *************** BLOCK BUSINESS LOGIC ***************

/**
 * Creates a curriculum block.
 * @param {Object} input
 * @returns {Promise<Object>}
 */
async function CreateBlock(input) {
  // *************** Validate and sanitize block payload before persistence
  const validatedInput = ValidateInputWithJoi(CreateBlockValidator, input);

  // *************** Ensure the block points to an existing academic year
  await FindAcademicYearById(validatedInput.academic_year_id);

  // *************** Persist block before attaching its id to the academic year
  const createdBlock = await BlockModel.create(validatedInput);

  // *************** Maintain AcademicYear.block_ids for missing-grade cron lookup
  await AddBlockToAcademicYear(createdBlock.academic_year_id, createdBlock._id);

  return createdBlock;
}

/**
 * Updates a curriculum block.
 *
 * Business rules:
 * - Block must exist.
 * - Block cannot be updated
 *   if grades already exist.
 * 
 * @param {string} blockId
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {AppError}
 */
async function UpdateBlock(blockId, input) {
  // *************** Validate and sanitize block id and payload before business rules
  const validatedId = ValidateInputWithJoi(BlockIdValidator, { block_id: blockId });
  const validatedInput = ValidateInputWithJoi(UpdateBlockValidator, input);

  // *************** Ensure the target block exists before applying lock validation
  const existingBlock = await BlockModel.findById(validatedId.block_id);

  if (!existingBlock) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  // *************** Protect blocks that already have submitted student grades
  await ValidateGradeLock('BLOCK', validatedId.block_id);

  if (validatedInput.academic_year_id !== undefined) {
    // *************** Ensure the new academic year exists before moving the block reference
    await FindAcademicYearById(validatedInput.academic_year_id);
  }

  const updatedBlock = await BlockModel.findByIdAndUpdate(validatedId.block_id, validatedInput, {
    new: true,
    runValidators: true,
  });

  if (
    validatedInput.academic_year_id !== undefined &&
    String(validatedInput.academic_year_id) !== String(existingBlock.academic_year_id)
  ) {
    // *************** Keep AcademicYear.block_ids in sync when a block changes academic year
    await RemoveBlockFromAcademicYear(existingBlock.academic_year_id, existingBlock._id);
    await AddBlockToAcademicYear(updatedBlock.academic_year_id, updatedBlock._id);
  }

  return updatedBlock;
}

/**
 * Deletes a curriculum block.
 *
 * Business rules:
 * - Block must exist.
 * - Block cannot be deleted
 *   if it still contains subjects.
 * - Block cannot be deleted
 *   if grades already exist.
 * @param {string} blockId
 * @returns {Promise<boolean>}
 * @throws {AppError}
 */
async function DeleteBlock(blockId) {
  // *************** Validate block id before dependency checks
  const validatedId = ValidateInputWithJoi(BlockIdValidator, { block_id: blockId });

  // *************** Ensure the target block exists before checking dependencies
  const existingBlock = await BlockModel.findById(validatedId.block_id);

  if (!existingBlock) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  // *************** Prevent deleting a block that still owns subjects
  const existingSubjects = await SubjectModel.exists({
    block_id: validatedId.block_id,
  });

  if (existingSubjects) {
    throw new AppError('BLOCK_HAS_SUBJECTS', 409, 'Block still contains subjects');
  }

  // *************** Protect blocks that already have submitted student grades
  await ValidateGradeLock('BLOCK', validatedId.block_id);

  await BlockModel.findByIdAndDelete(validatedId.block_id);

  // *************** Remove stale block reference from its academic year after deletion
  await RemoveBlockFromAcademicYear(existingBlock.academic_year_id, existingBlock._id);

  return true;
}

// *************** SUBJECT BUSINESS LOGIC ***************

/**
 * Creates a subject within a block.
 *
 * Business rules:
 * - Parent block must exist.
 * - Total subject weightage within a block
 *   cannot exceed 100%.
 * - Block weightage total
 *   cannot exceed 100%.
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {AppError}
 */
async function CreateSubject(input) {
  // *************** Validate and sanitize subject payload before business rules
  const validatedInput = ValidateInputWithJoi(CreateSubjectValidator, input);

  // *************** Validate that the subject is attached to an existing block
  const existingBlock = await BlockModel.findById(validatedInput.block_id);

  if (!existingBlock) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  // *************** Sum existing subject weightage inside the same block
  const weightageSummary = await SubjectModel.aggregate([
    {
      $match: {
        block_id: existingBlock._id,
      },
    },
    {
      $group: {
        _id: null,
        totalWeightage: {
          $sum: '$weightage',
        },
      },
    },
  ]);

  const currentWeightage = weightageSummary[0]?.totalWeightage ?? 0;

  // *************** Ensure the new subject keeps the block total within 100%
  ValidateWeightageLimit(currentWeightage, validatedInput.weightage);

  return SubjectModel.create(validatedInput);
}

/**
 * Updates a subject.
 *
 * Business rules:
 * - Subject must exist.
 * - Subject cannot be updated
 *   if grades already exist.
 * - Total sibling weightage
 *   plus new weightage
 *   cannot exceed 100%.
 * @param {string} subjectId
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {AppError}
 */
async function UpdateSubject(subjectId, input) {
  // *************** Validate and sanitize subject id and payload before business rules
  const validatedId = ValidateInputWithJoi(SubjectIdValidator, { subject_id: subjectId });
  const validatedInput = ValidateInputWithJoi(UpdateSubjectValidator, input);

  // *************** Ensure the target subject exists before applying lock validation
  const existingSubject = await SubjectModel.findById(validatedId.subject_id);

  if (!existingSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  // *************** Protect subjects that already have submitted student grades
  await ValidateGradeLock('SUBJECT', validatedId.subject_id);

  if (validatedInput.weightage !== undefined) {
    // *************** Sum sibling subject weightage while excluding the subject being updated
    const weightageSummary = await SubjectModel.aggregate([
      {
        $match: {
          block_id: existingSubject.block_id,
          _id: {
            $ne: existingSubject._id,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalWeightage: {
            $sum: '$weightage',
          },
        },
      },
    ]);

    const currentWeightage = weightageSummary[0]?.totalWeightage ?? 0;

    // *************** Ensure the updated subject keeps sibling totals within 100%
    ValidateWeightageLimit(currentWeightage, validatedInput.weightage);
  }

  return SubjectModel.findByIdAndUpdate(validatedId.subject_id, validatedInput, {
    new: true,
    runValidators: true,
  });
}

/**
 * Deletes a subject.
 *
 * Business rules:
 * - Subject must exist.
 * - Subject cannot be deleted
 *   if tests still exist.
 * - Subject cannot be deleted
 *   if grades already exist.
 * @param {string} subjectId
 * @returns {Promise<boolean>}
 * @throws {AppError}
 */
async function DeleteSubject(subjectId) {
  // *************** Validate subject id before dependency checks
  const validatedId = ValidateInputWithJoi(SubjectIdValidator, { subject_id: subjectId });

  // *************** Ensure the target subject exists before checking dependencies
  const existingSubject = await SubjectModel.findById(validatedId.subject_id);

  if (!existingSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  // *************** Prevent deleting a subject that still owns tests
  const existingTests = await TestModel.exists({
    subject_id: validatedId.subject_id,
  });

  if (existingTests) {
    throw new AppError('SUBJECT_HAS_TESTS', 409, 'Subject still contains tests');
  }

  // *************** Protect subjects that already have submitted student grades
  await ValidateGradeLock('SUBJECT', validatedId.subject_id);

  await SubjectModel.findByIdAndDelete(validatedId.subject_id);

  return true;
}

// *************** TEST BUSINESS LOGIC ***************

/**
 * Creates a test within a subject.
 *
 * Business rules:
 * - Parent subject must exist.
 * - Total test weightage
 *   within a subject
 *   cannot exceed 100%.
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {AppError}
 */
async function CreateTest(input) {
  // *************** Validate and sanitize test payload before business rules
  const validatedInput = ValidateInputWithJoi(CreateTestValidator, input);

  // *************** Validate that the test is attached to an existing subject
  const existingSubject = await SubjectModel.findById(validatedInput.subject_id);

  if (!existingSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  // *************** Load sibling tests to calculate the current subject test total
  const existingTests = await TestModel.find({
    subject_id: validatedInput.subject_id,
  }).select('weightage');

  const totalWeightage = existingTests.reduce((total, currentTest) => total + currentTest.weightage, 0);

  // *************** Ensure the new test keeps the subject total within 100%
  ValidateWeightageLimit(totalWeightage, validatedInput.weightage);

  return TestModel.create(validatedInput);
}

/**
 * Updates a test.
 *
 * Business rules:
 * - Test must exist.
 * - Test cannot be updated
 *   if grades already exist.
 * - Total sibling test weightage
 *   plus new weightage
 *   cannot exceed 100%.
 *
 * @param {string} testId
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {AppError}
 */
async function UpdateTest(testId, input) {
  // *************** Validate and sanitize test id and payload before business rules
  const validatedId = ValidateInputWithJoi(TestIdValidator, { test_id: testId });
  const validatedInput = ValidateInputWithJoi(UpdateTestValidator, input);

  // *************** Ensure the target test exists before applying lock validation
  const existingTest = await TestModel.findById(validatedId.test_id);

  if (!existingTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  // *************** Protect tests that already have submitted student grades
  await ValidateGradeLock('TEST', validatedId.test_id);

  if (validatedInput.weightage !== undefined) {
    // *************** Sum sibling test weightage while excluding the test being updated
    const weightageSummary = await TestModel.aggregate([
      {
        $match: {
          subject_id: existingTest.subject_id,
          _id: {
            $ne: existingTest._id,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalWeightage: {
            $sum: '$weightage',
          },
        },
      },
    ]);

    const currentWeightage = weightageSummary[0]?.totalWeightage ?? 0;

    // *************** Ensure the updated test keeps sibling totals within 100%
    ValidateWeightageLimit(currentWeightage, validatedInput.weightage);
  }

  return TestModel.findByIdAndUpdate(validatedId.test_id, validatedInput, {
    new: true,
    runValidators: true,
  });
}

/**
 * Deletes a test.
 *
 * Business rules:
 * - Test must exist.
 * - Test cannot be deleted
 *   if grades already exist.
 * @param {string} testId
 * @returns {Promise<boolean>}
 * @throws {AppError}
 */
async function DeleteTest(testId) {
  // *************** Validate test id before lock checks
  const validatedId = ValidateInputWithJoi(TestIdValidator, { test_id: testId });

  // *************** Ensure the target test exists before applying lock validation
  const existingTest = await TestModel.findById(validatedId.test_id);

  if (!existingTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  // *************** Protect tests that already have submitted student grades
  await ValidateGradeLock('TEST', validatedId.test_id);

  await TestModel.findByIdAndDelete(validatedId.test_id);

  return true;
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateBlock,
  UpdateBlock,
  DeleteBlock,

  CreateSubject,
  UpdateSubject,
  DeleteSubject,

  CreateTest,
  UpdateTest,
  DeleteTest,
};


