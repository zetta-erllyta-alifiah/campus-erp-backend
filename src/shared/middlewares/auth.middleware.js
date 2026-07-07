// *************** IMPORT LIBRARY ***************
const jwt = require('jsonwebtoken');

// *************** IMPORT MODULE ***************
const { NormalizeJwtAuthFallback } = require('../../core/errors');

// *************** MIDDLEWARE ***************

/**
 * Extracts a bearer token from the request header and prepares request auth context.
 *
 * Invalid or expired JWTs are normalized into structured authError metadata,
 * then intentionally continue as anonymous requests for public GraphQL fields.
 *
 * @param {Object} request - Express request object.
 * @param {Object} response - Express response object.
 * @param {Function} next - Express next middleware.
 * @returns {void}
 */
function AuthMiddleware(request, response, next) {
  // *************** Read the Authorization header without failing when it is missing
  const authorizationHeader = request.headers.authorization || '';

  // *************** Allow unauthenticated requests to continue for public GraphQL fields
  if (!authorizationHeader.startsWith('Bearer ')) {
    request.authError = undefined;
    request.user = undefined;
    next();
    return;
  }

  // *************** Extract raw JWT value from the Bearer token format
  const token = authorizationHeader.replace('Bearer ', '');

  try {
    // *************** Verify token signature and expose decoded claims to downstream handlers
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    request.authError = undefined;
    request.user = decodedToken;
  } catch (error) {
    // *************** Convert JWT verification failure into structured non-blocking auth context
    const authError = NormalizeJwtAuthFallback(error);

    // *************** Preserve fallback metadata without exposing token or stack details
    request.authError = {
      code: authError.code,
      httpStatus: authError.httpStatus,
      message: authError.message,
      meta: authError.meta,
    };

    // *************** Treat invalid or expired tokens as anonymous requests
    request.user = undefined;
  }

  // *************** Continue request processing after authentication context is prepared
  next();
}

// *************** EXPORT MODULE ***************
module.exports = AuthMiddleware;
