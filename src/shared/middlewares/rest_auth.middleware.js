/**
 * REST authentication middleware.
 *
 * Responsibility:
 * - Require authenticated JWT context for REST endpoints.
 * - Reuse the auth context prepared by the global AuthMiddleware.
 */

// *************** IMPORT MODULE ***************
const { AppError } = require('../../core/errors');

// *************** MIDDLEWARE ***************

/**
 * Requires a valid authenticated user on the current REST request.
 *
 * @param {Object} request - Express request object.
 * @param {Object} response - Express response object.
 * @param {Function} next - Express next middleware.
 * @returns {void}
 */
function RequireAuthenticatedRestRequest(request, response, next) {
  if (request.authError) {
    next(
      new AppError(
        request.authError.code || 'UNAUTHENTICATED',
        request.authError.httpStatus || 401,
        request.authError.message || 'Authentication required',
        request.authError.meta || null,
      ),
    );
    return;
  }

  if (!request.user) {
    next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
    return;
  }

  next();
}

// *************** EXPORT MODULE ***************
module.exports = {
  RequireAuthenticatedRestRequest,
};
