// *************** IMPORT MODULE ***************
const {
    ValidateGradeLock,
} = require(
    './helpers/grade_lock.helper'
);

const {
    BlockModel,
    SubjectModel,
    TestModel,
} = require('./models');

const { AppError } =
    require('../../../core/errors');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Checks whether the total weightage exceeds 100.
 *
 * @param {number} currentWeightage
 * @param {number} incomingWeightage
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

// /**
//  * Checks whether the entity is locked by
//  * existing student grades.
//  *
//  * @param {Object} existingGrade
//  *
//  * @throws {AppError}
//  */
// function ValidateRelationalLock(
//     existingGrade,
// ) {
//     if (existingGrade) {
//         throw new AppError(
//             'Entity locked',
//             'ENTITY_LOCKED_GRADES_EXIST',
//             409,
//         );
//     }
// }

// *************** MUTATION ***************
async function CreateBlock(
    input,
) {
    return BlockModel.create(
        input
    );
}

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

async function DeleteBlock(
    blockId,
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

    await BlockModel.findByIdAndDelete(
        blockId
    );

    return true;
}

async function CreateSubject(
    input,
) {
    const existingSubjects =
        await SubjectModel.find({
            block_id:
                input.block_id,
        });

    const totalWeightage =
        existingSubjects.reduce(
            (
                total,
                subject,
            ) =>
                total +
                subject.weightage,
            0,
        );

    ValidateWeightageLimit(
        totalWeightage,
        input.weightage,
    );

    return SubjectModel.create(
        input
    );
}

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
        const siblingSubjects =
            await SubjectModel.find({
                block_id:
                    existingSubject.block_id,
                _id: {
                    $ne: subjectId,
                },
            });

        const totalWeightage =
            siblingSubjects.reduce(
                (
                    total,
                    subject,
                ) =>
                    total +
                    subject.weightage,
                0,
            );

        ValidateWeightageLimit(
            totalWeightage,
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

async function DeleteSubject(
    subjectId,
) {
    // TODO:
    // const existingGrade =
    //     await StudentGradeModel.findOne(...);

     await ValidateGradeLock(
        'SUBJECT',
        subjectId,
    );

    const deletedSubject =
        await SubjectModel.findByIdAndDelete(
            subjectId
        );

    if (!deletedSubject) {
        throw new AppError(
            'Subject not found',
            'SUBJECT_NOT_FOUND',
            404,
        );
    }

    return true;
}

async function CreateTest(
    input,
) {
    const existingTests =
        await TestModel.find({
            subject_id:
                input.subject_id,
        });

    const totalWeightage =
        existingTests.reduce(
            (
                total,
                test,
            ) =>
                total +
                test.weightage,
            0,
        );

    ValidateWeightageLimit(
        totalWeightage,
        input.weightage,
    );

    return TestModel.create(
        input
    );
}

async function UpdateTest(
    testId,
    input,
) {
    // TODO:
    // const existingGrade =
    //     await StudentGradeModel.findOne(...);

    const existingTest =
        await TestModel.findById(
            testId
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
        const siblingTests =
            await TestModel.find({
                subject_id:
                    existingTest.subject_id,
                _id: {
                    $ne: testId,
                },
            });

        const totalWeightage =
            siblingTests.reduce(
                (
                    total,
                    test,
                ) =>
                    total +
                    test.weightage,
                0,
            );

        ValidateWeightageLimit(
            totalWeightage,
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

async function DeleteTest(
    testId,
) {
    // TODO:
    // const existingGrade =
    //     await StudentGradeModel.findOne(...);

    await ValidateGradeLock(
        'TEST',
        testId,
    );
    const deletedTest =
        await TestModel.findByIdAndDelete(
            testId
        );

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