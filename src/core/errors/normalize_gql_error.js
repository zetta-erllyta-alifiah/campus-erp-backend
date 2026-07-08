// *************** IMPORT LIBRARY ***************
const { GraphQLError } = require('graphql');

// *************** IMPORT MODULE ***************
const { ErrorLogModel } = require('./error_log.model');

/**
 * Creates a standardized GraphQL error.
 *
 * @param {string} code
 * @param {number} httpStatus
 * @param {string} message
 * @param {Object|null} [meta=null]
 * @returns {GraphQLError}
 */
function CreateGraphQLError(code, httpStatus = 500, message = code, meta = null) {
  return new GraphQLError(message, {
    extensions: {
      code,
      httpStatus,
      meta,
    },
  });
}

/**
 * Converts unknown errors into GraphQL errors.
 *
 * @param {Error} error
 * @returns {GraphQLError}
 */
function NormalizeGqlError(error) {
  if (error instanceof GraphQLError) {
    return error;
  }

  return CreateGraphQLError('INTERNAL_SERVER_ERROR', 500, error.message || 'Internal server error');
}

/**
 * Logs an error and converts it into a GraphQL error.
 *
 * @param {Error} error
 * @param {Object} [context={}]
 * @returns {Promise<GraphQLError>}
 */
async function LogAndNormalizeGqlError(error, context = {}) {
  const gqlError = NormalizeGqlError(error);
  const extensions = gqlError.extensions || {};

  try {
    await ErrorLogModel.create({
      message: gqlError.message,
      code: extensions.code || 'INTERNAL_SERVER_ERROR',
      http_status: extensions.httpStatus || 500,
      source: context.source || 'graphql',
      stack: error.stack || null,
      meta: extensions.meta || null,
    });
  } catch (logError) {
    console.error(`Failed to save error log: ${logError.message}`);
  }

  return gqlError;
}

module.exports = {
  CreateGraphQLError,
  NormalizeGqlError,
  LogAndNormalizeGqlError,
};
