// *************** IMPORT MODULE ***************
const { StudentModel } = require('./student.model');
const { AppError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * Creates a new student.
 *
 * Business rules:
 * - Student email must be unique.
 * - Student number must be unique.
 * @param {Object} input
 * @returns {Promise<Object>}
 * @throws {AppError} 400
 */
async function CreateStudentHelper(input) {
  // *************** Validate unique email ***************
  const existingEmail = await StudentModel.findOne({
    email: input.email,
  });

  if (existingEmail) {
    throw new AppError('Email already exists', 'EMAIL_ALREADY_EXISTS', 400);
  }

  // *************** Validate unique student number ***************
  const existingStudentNumber = await StudentModel.findOne({
    student_number: input.student_number,
  });

  if (existingStudentNumber) {
    throw new AppError('Student number already exists', 'STUDENT_NUMBER_ALREADY_EXISTS', 400);
  }

  return StudentModel.create(input);
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateStudentHelper,
};
