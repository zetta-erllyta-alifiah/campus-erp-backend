// *************** IMPORT LIBRARY ***************
const jwt = require('jsonwebtoken');

// *************** MUTATION ***************

/**
 * Extracts a bearer token from the request header and injects the decoded payload into req.user.
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
    request.user = undefined;
    next();
    return;
  }

  // *************** Extract raw JWT value from the Bearer token format
  const token = authorizationHeader.replace('Bearer ', '');

  try {
    // *************** Verify token signature and expose decoded claims to downstream handlers
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    request.user = decodedToken;
  } catch (error) {
    // *************** Treat invalid or expired tokens as anonymous requests
    request.user = undefined;
  }

  // *************** Continue request processing after authentication context is prepared
  next();
}

// *************** EXPORT MODULE ***************
module.exports = AuthMiddleware;
