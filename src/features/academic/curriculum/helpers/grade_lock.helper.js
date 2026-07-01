// *************** IMPORT MODULE ***************
const { AppError } =
    require('../../../../core/errors');

// TODO:
// Uncomment when StudentGrade module exists
//
// const {
//     StudentGradeModel,
// } = require(
//     '../grading/student-grade.model'
// );

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Validates whether an entity is locked by
 * existing student grades.
 *
 * @param {string} entityType
 * @param {string} entityId
 *
 * @returns {Promise<void>}
 *
 * @throws {AppError} 409
 */
async function ValidateGradeLock(
    entityType,
    entityId,
) {
    // Temporary mock query until
    // StudentGradeModel exists.

    const existingGrade = null;

    /*
    const existingGrade =
        await StudentGradeModel.findOne({
            entity_type: entityType,
            entity_id: entityId,
        });
    */

    if (existingGrade) {
        throw new AppError(
            'Entity locked',
            'ENTITY_LOCKED_GRADES_EXIST',
            409,
        );
    }
}

// *************** EXPORT MODULE ***************
module.exports = {
    ValidateGradeLock,
};