// *************** IMPORT LIBRARY ***************
const { GraphQLError } = require('graphql');

// *************** IMPORT MODULE ***************
const { AppError } = require('./app_error');
const { ErrorLogModel } = require('./error_log.model');

/**
 * Builds safe structured context for fallback error logging.
 *
 * @param {Error} error - Error to summarize.
 * @returns {Object} Safe error context.
 */
function BuildSafeFallbackErrorContext(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || 'INTERNAL_SERVER_ERROR',
    http_status: error?.httpStatus || error?.extensions?.httpStatus || 500,
    message: error?.message || 'Internal server error',
  };
}

/**
 * Writes structured fallback logs when database logging is unavailable.
 *
 * @param {Object} payload - Structured fallback log payload.
 * @returns {void}
 */
function WriteStructuredFallbackLog(payload) {
  try {
    process.stderr.write(
      `${JSON.stringify({
        level: 'error',
        event: 'ERROR_LOG_WRITE_FAILED',
        timestamp: new Date().toISOString(),
        ...payload,
      })}\n`,
    );
  } catch (_fallbackLogError) {
    // Intentionally swallow fallback logger failures to avoid recursive logging.
  }
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

  if (error instanceof AppError || error?.isOperational) {
    return new GraphQLError(error.message, {
      extensions: {
        code: error.code,
        httpStatus: error.httpStatus,
        meta: error.meta || null,
      },
    });
  }

  if (error?.code === 11000) {
    return new GraphQLError('Duplicate record already exists', {
      extensions: {
        code: 'DUPLICATE_KEY',
        httpStatus: 409,
        meta: {
          keyPattern: error.keyPattern || null,
          keyValue: error.keyValue || null,
        },
      },
    });
  }

  return new GraphQLError(error.message || 'Internal server error', {
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      meta: null,
    },
  });
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
      meta: extensions.meta || context.meta || null,
    });
  } catch (logError) {
    WriteStructuredFallbackLog({
      source: context.source || 'graphql',
      error: BuildSafeFallbackErrorContext(error),
      log_error: BuildSafeFallbackErrorContext(logError),
      meta: extensions.meta || context.meta || null,
    });
  }

  return gqlError;
}

module.exports = {
  WriteStructuredFallbackLog,
  NormalizeGqlError,
  LogAndNormalizeGqlError,
};
