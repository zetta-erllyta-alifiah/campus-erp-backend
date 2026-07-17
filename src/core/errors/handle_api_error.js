/**
 * Central REST error handling middleware.
 *
 * Responsibility:
 * - Persist REST failures through ErrorLogModel.
 * - Translate AppError instances into consistent HTTP responses.
 * - Prevent unexpected implementation details from reaching clients.
 */

// *************** IMPORT MODULE ***************
const { AppError } = require('./app_error');
const { ErrorLogModel } = require('./error_log.model');

// *************** ERROR MIDDLEWARE ***************

/**
 * Logs and formats errors raised by REST controllers.
 *
 * @param {Error} error - Original controller or stream error.
 * @param {Object} request - Express request object.
 * @param {Object} response - Express response object.
 * @param {Function} next - Express error continuation callback.
 * @returns {Promise<Object|void>} Standard JSON failure response when headers are writable.
 */
async function HandleApiError(error, request, response, next) {
  const isOperationalError = error instanceof AppError || error?.isOperational;
  const normalizedError = isOperationalError
    ? error
    : new AppError('INTERNAL_SERVER_ERROR', 500, 'Internal server error');

  // *************** START: Persist REST error context ***************
  try {
    await ErrorLogModel.create({
      message: normalizedError.message,
      code: normalizedError.code,
      http_status: normalizedError.httpStatus,
      source: `${request.method} ${request.originalUrl}`,
      stack: error.stack || null,
      meta: {
        ...(normalizedError.meta || {}),
        route_params: request.params || {},
      },
    });
  } catch (loggingError) {
    console.error(`Failed to save REST error log: ${loggingError.message}`);
  }
  // *************** END: Persist REST error context ***************

  // *************** Terminate a partial binary response when streaming already started
  if (response.headersSent) {
    response.destroy(error);

    return;
  }

  return response.status(normalizedError.httpStatus).json({
    status: 'fail',
    code: normalizedError.code,
    message: normalizedError.message,
    meta: normalizedError.meta || null,
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  HandleApiError,
};
