// *************** HELPER CLASS ***************

/**
 * Represents an application-specific error.
 *
 * @class
 * @extends Error
 * @param {string} code - Internal application error code.
 * @param {number} httpStatus - HTTP status code.
 * @param {string} message - Human readable error message.
 * @param {Object|null} [meta=null] - Additional error metadata.
 */
class AppError extends Error {
  constructor(code, httpStatus = 500, message = code, meta = null) {
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
