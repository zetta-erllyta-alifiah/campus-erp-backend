// *************** ERROR CLASS ***************

/**
 * Operational application error for business logic failures.
 */
class AppError extends Error {
  /**
   * Creates a structured operational error.
   *
   * @param {string} code - Stable application error code.
   * @param {number} httpStatus - HTTP-compatible status code.
   * @param {string} message - Static developer-facing error message.
   * @param {Object|null} [meta=null] - Optional structured metadata.
   */
  constructor(code, httpStatus, message, meta = null) {
    super(message);

    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.meta = meta;
    this.isOperational = true;
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  AppError,
};
