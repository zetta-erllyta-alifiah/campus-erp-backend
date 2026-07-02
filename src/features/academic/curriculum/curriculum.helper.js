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
const {
    BlockModel,
    SubjectModel,
    TestModel,
    StudentGradeModel,
} = require(
    './curriculum.model'
);

const { AppError } =
    require('../../../core/errors');

// *************** IMPORT HELPER FUNCTION ***************

/**
 * Validates that the accumulated
 * weightage does not exceed 100%.
 *
 * Business rule:
 * - Total weightage of siblings
 *   plus incoming weightage
 *   must be <= 100%.
 *
 * @param {number} currentWeightage
 * @param {number} incomingWeightage
 *
 * @returns {void}
 *
 * @throws {AppError}
 */
function ValidateWeightageLimit(
    currentWeightage,
    incomingWeightage,
) {
    const totalWeightage =
        Math.round(
            (
                currentWeightage +
                incomingWeightage
            ) * 100
        ) / 100;

    if (totalWeightage > 100) {
        throw new AppError(
            'Total weightage exceeds 100%',
            'WEIGHTAGE_LIMIT_EXCEEDED',
            400,
        );
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
 *
 * @param {string} entityType
 * @param {string} entityId
 *
 * @returns {Promise<void>}
 *
 * @throws {AppError}
 */
async function ValidateGradeLock(
    entityType,
    entityId,
) {
    const existingGrade =
        await StudentGradeModel.findOne(
            {
                entity_type:
                    entityType,
                entity_id:
                    entityId,
            },
        );

    if (existingGrade) {
        throw new AppError(
            'Entity locked',
            'ENTITY_LOCKED_GRADES_EXIST',
            409,
        );
    }
}

// *************** BLOCK BUSINESS LOGIC ***************

/**
 * Creates a curriculum block.
 *
 * @param {Object} input
 *
 * @returns {Promise<Object>}
 */
async function CreateBlock(
    input,
) {
    return BlockModel.create(
        input
    );
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
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError}
 */
async function UpdateBlock(
    blockId,
    input,
) {
    // TODO:
    // const existingGrade =
    //     await StudentGradeModel.findOne(...);

    const existingBlock =
        await BlockModel.findById(
            blockId
        );

    if (!existingBlock) {
        throw new AppError(
            'Block not found',
            'BLOCK_NOT_FOUND',
            404,
        );
    }

    await ValidateGradeLock(
        'BLOCK',
        blockId,
    );

    return BlockModel.findByIdAndUpdate(
        blockId,
        input,
        {
            new: true,
            runValidators: true,
        },
    );
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
 *
 * @param {string} blockId
 *
 * @returns {Promise<boolean>}
 *
 * @throws {AppError}
 */
async function DeleteBlock(
    blockId,
) {
    const existingBlock =
        await BlockModel.findById(
            blockId
        );

    if (!existingBlock) {
        throw new AppError(
            'Block not found',
            'BLOCK_NOT_FOUND',
            404,
        );
    }

    const existingSubjects =
        await SubjectModel.exists({
            block_id: blockId,
        });

    if (existingSubjects) {
        throw new AppError(
            'Block still contains subjects',
            'BLOCK_HAS_SUBJECTS',
            409,
        );
    }

    await ValidateGradeLock(
        'BLOCK',
        blockId,
    );

    await BlockModel.findByIdAndDelete(
        blockId,
    );

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
 *
 * @param {Object} input
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError}
 */
async function CreateSubject(
    input,
) {
    const existingBlock =
        await BlockModel.findById(
            input.block_id,
        );

    if (!existingBlock) {
        throw new AppError(
            'Block not found',
            'BLOCK_NOT_FOUND',
            404,
        );
    }

    const weightageSummary =
        await SubjectModel.aggregate([
            {
                $match: {
                    block_id:
                        existingBlock._id,
                },
            },
            {
                $group: {
                    _id: null,
                    totalWeightage: {
                        $sum:
                            '$weightage',
                    },
                },
            },
        ]);

    const currentWeightage =
        weightageSummary[0]
            ?.totalWeightage ?? 0;

    ValidateWeightageLimit(
        currentWeightage,
        input.weightage,
    );

    return SubjectModel.create(
        input,
    );
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
 *
 * @param {string} subjectId
 * @param {Object} input
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError}
 */
async function UpdateSubject(
    subjectId,
    input,
) {
    // TODO:
    // const existingGrade =
    //     await StudentGradeModel.findOne(...);

    const existingSubject =
        await SubjectModel.findById(
            subjectId
        );

    if (!existingSubject) {
        throw new AppError(
            'Subject not found',
            'SUBJECT_NOT_FOUND',
            404,
        );
    }

    await ValidateGradeLock(
        'SUBJECT',
        subjectId,
    );

    if (
        input.weightage !==
        undefined
    ) {
        const weightageSummary =
            await SubjectModel.aggregate([
                {
                    $match: {
                        block_id:
                            existingSubject.block_id,
                        _id: {
                            $ne:
                                existingSubject._id,
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalWeightage: {
                            $sum:
                                '$weightage',
                        },
                    },
                },
            ]);

        const currentWeightage =
            weightageSummary[0]
                ?.totalWeightage ?? 0;

        ValidateWeightageLimit(
            currentWeightage,
            input.weightage,
        );
    }

    return SubjectModel.findByIdAndUpdate(
        subjectId,
        input,
        {
            new: true,
            runValidators: true,
        },
    );
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
 *
 * @param {string} subjectId
 *
 * @returns {Promise<boolean>}
 *
 * @throws {AppError}
 */
async function DeleteSubject(
    subjectId,
) {
    const existingSubject =
        await SubjectModel.findById(
            subjectId,
        );

    if (!existingSubject) {
        throw new AppError(
            'Subject not found',
            'SUBJECT_NOT_FOUND',
            404,
        );
    }

    const existingTests =
        await TestModel.exists({
            subject_id:
                subjectId,
        });

    if (existingTests) {
        throw new AppError(
            'Subject still contains tests',
            'SUBJECT_HAS_TESTS',
            409,
        );
    }

    await ValidateGradeLock(
        'SUBJECT',
        subjectId,
    );

    await SubjectModel.findByIdAndDelete(
        subjectId,
    );

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
 *
 * @param {Object} input
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError}
 */
async function CreateTest(
    input,
) {
    const existingSubject =
        await SubjectModel.findById(
            input.subject_id,
        );

    if (!existingSubject) {
        throw new AppError(
            'Subject not found',
            'SUBJECT_NOT_FOUND',
            404,
        );
    }

    const existingTests =
        await TestModel.find({
            subject_id:
                input.subject_id,
        }).select(
            'weightage'
        );

    const totalWeightage =
        existingTests.reduce(
            (
                total,
                currentTest,
            ) =>
                total +
                currentTest.weightage,
            0,
        );

    ValidateWeightageLimit(
        totalWeightage,
        input.weightage,
    );

    return TestModel.create(
        input,
    );
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
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError}
 */
async function UpdateTest(
    testId,
    input,
) {
    const existingTest =
        await TestModel.findById(
            testId,
        );

    if (!existingTest) {
        throw new AppError(
            'Test not found',
            'TEST_NOT_FOUND',
            404,
        );
    }

    await ValidateGradeLock(
        'TEST',
        testId,
    );

    if (
        input.weightage !==
        undefined
    ) {
        const weightageSummary =
            await TestModel.aggregate([
                {
                    $match: {
                        subject_id:
                            existingTest.subject_id,
                        _id: {
                            $ne:
                                existingTest._id,
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalWeightage:
                        {
                            $sum:
                                '$weightage',
                        },
                    },
                },
            ]);

        const currentWeightage =
            weightageSummary[0]
                ?.totalWeightage ??
            0;

        ValidateWeightageLimit(
            currentWeightage,
            input.weightage,
        );
    }

    return TestModel.findByIdAndUpdate(
        testId,
        input,
        {
            new: true,
            runValidators: true,
        },
    );
}

/**
 * Deletes a test.
 *
 * Business rules:
 * - Test must exist.
 * - Test cannot be deleted
 *   if grades already exist.
 *
 * @param {string} testId
 *
 * @returns {Promise<boolean>}
 *
 * @throws {AppError}
 */
async function DeleteTest(
    testId,
) {
    // TODO:
    // const existingGrade =
    //     await StudentGradeModel.findOne(...);

    const existingTest =
        await TestModel.findById(
            testId,
        );

    if (!existingTest) {
        throw new AppError(
            'Test not found',
            'TEST_NOT_FOUND',
            404,
        );
    }

    await ValidateGradeLock(
        'TEST',
        testId,
    );

    await TestModel.findByIdAndDelete(
        testId,
    );

    return true;

    if (!deletedTest) {
        throw new AppError(
            'Test not found',
            'TEST_NOT_FOUND',
            404,
        );
    }

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