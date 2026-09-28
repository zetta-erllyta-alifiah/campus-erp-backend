// *************** IMPORT LIBRARY ***************
const { GraphQLError } = require('graphql');

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
 * @returns {GraphQLError} Structured auth fallback error.
 */
function NormalizeJwtAuthFallback(error) {
  const errorName = error?.name || 'UnknownJwtError';
  const fallbackReason = JWT_AUTH_FALLBACK_REASONS[errorName] || 'JWT_VERIFICATION_FAILED';

  return new GraphQLError('JWT verification failed.', {
    extensions: {
      code: fallbackReason,
      httpStatus: 401,
      meta: {
        reason: errorName,
      },
    },
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  NormalizeJwtAuthFallback,
};
