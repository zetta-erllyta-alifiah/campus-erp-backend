// *************** IMPORT MODULE ***************
const {
    StudentModel
} = require('./student.model');

const {
    AcademicYearModel
} =
    require(
        '../../academic/enrollment/academic_year.model'
    );

const {
    AppError,
} = require(
    '../../../core/errors'
);

// *************** MUTATION ***************

/**
 * Creates a new student.
 *
 * Business rules:
 * - Student email must be unique.
 * - Student number must be unique.
 *
 * @param {Object} input
 *
 * @returns {Promise<Object>}
 *
 * @throws {AppError} 400
 */
async function CreateStudentHelper(
    input,
) {
    // *************** START: Validate email uniqueness ***************
    const existingEmail =
        await StudentModel.findOne({
            email: input.email,
        });

    if (existingEmail) {
        throw new AppError(
            'Email already exists',
            'EMAIL_ALREADY_EXISTS',
            400,
        );
    }
    // *************** END: Validate email uniqueness***************

    // *************** START: Validate student number uniqueness ***************
    const existingStudentNumber =
        await StudentModel.findOne({
            student_number:
                input.student_number,
        });

    if (
        existingStudentNumber
    ) {
        throw new AppError(
            'Student number already exists',
            'STUDENT_NUMBER_ALREADY_EXISTS',
            400,
        );
    }
    // *************** END: Validate student number uniqueness ***************

    return StudentModel.create(
        input,
    );
}

/**
 * Deletes a student and removes
 * all bidirectional references
 * from academic years.
 *
 * Business rules:
 * - Student must exist.
 * - Student must be removed
 *   from all enrolled
 *   academic years.
 *
 * @param {string} studentId
 *
 * @returns {Promise<boolean>}
 *
 * @throws {AppError}
 */
async function DeleteStudentHelper(
    studentId,
) {
    // *************** START: Validate student ***************
    const existingStudent =
        await StudentModel.findById(
            studentId,
        );

    if (!existingStudent) {
        throw new AppError(
            'Student not found',
            'STUDENT_NOT_FOUND',
            404,
        );
    }
    // *************** END: Validate student ***************

    // *************** START: Maintain bidirectional consistency ***************
    // Remove student references from
    // all academic years in which
    // the student is enrolled.
    await AcademicYearModel.updateMany(
        {
            _id: {
                $in:
                    existingStudent.academic_year_ids,
            },
        },
        {
            $pull: {
                student_ids:
                    studentId,
            },
        },
    );
    // *************** END: Maintain bidirectional consistency ***************

    // *************** START: Delete student ***************
    await StudentModel.findByIdAndDelete(
        studentId,
    );
    // *************** END: Delete student ***************

    return true;
}


// *************** EXPORT MODULE ***************
module.exports = {
    CreateStudentHelper,
    DeleteStudentHelper,
};