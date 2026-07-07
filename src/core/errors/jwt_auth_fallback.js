// *************** IMPORT MODULE ***************
const { AppError } = require('./app_error');

// *************** GLOBAL VARIABLES ***************
const JWT_AUTH_FALLBACK_REASONS = {
  JsonWebTokenError: 'INVALID_JWT',
  TokenExpiredError: 'EXPIRED_JWT',
  NotBeforeError: 'INACTIVE_JWT',
};

// *************** IMPORT HELPER FUNCTION ***************

/**
 * Converts JWT verification failures into a structured auth fallback error.
 *
 * Invalid or expired JWTs intentionally continue as anonymous requests because
 * field-level authorization is enforced by the GraphQL auth directive.
 *
 * @param {Error} error - JWT verification error.
 * @returns {AppError} Structured auth fallback error.
 */
function NormalizeJwtAuthFallback(error) {
  const errorName = error?.name || 'UnknownJwtError';
  const fallbackReason = JWT_AUTH_FALLBACK_REASONS[errorName] || 'JWT_VERIFICATION_FAILED';

  return new AppError(fallbackReason, 401, 'JWT verification failed; request continued as anonymous.', {
    reason: errorName,
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  NormalizeJwtAuthFallback,
};
