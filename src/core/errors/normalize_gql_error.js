// *************** IMPORT LIBRARY ***************
const {
    GraphQLError,
} = require('graphql');

// *************** IMPORT MODULE ***************
const {
    AppError
} = require('./app_error');

/**
 * Converts internal errors
 * into GraphQL errors.
 *
 * @param {Error} error
 *
 * @returns {GraphQLError}
 */
function NormalizeGqlError(
    error,
) {
    if (error instanceof AppError) {
        return new GraphQLError(
            error.message,
            {
                extensions: {
                    code:
                        error.code,
                    httpStatus:
                        error.httpStatus,
                    meta:
                        error.meta,
                },
            },
        );
    }

    return new GraphQLError(
        error.message ||
        'Internal server error',
        {
            extensions: {
                code:
                    'INTERNAL_SERVER_ERROR',
            },
        },
    );
}

module.exports = {
    NormalizeGqlError,
};