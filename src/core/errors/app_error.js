// *************** HELPER CLASS ***************

/**
 * Represents an application-specific error.
 *
 * @class
 * @extends Error
 * @param {string} message - Human readable error message.
 * @param {string} code - Internal application error code.
 * @param {number} [httpStatus=500] - HTTP status code.
 * @param {Object|null} [meta=null] - Additional error metadata.
 */
class AppError extends Error {
  constructor(message, code, httpStatus = 500, meta = null) {
    super(message);

    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.meta = meta;

    Error.captureStackTrace(this, this.constructor);
  }
}

// *************** EXPORT MODULE ***************

module.exports = {
  AppError,
};
