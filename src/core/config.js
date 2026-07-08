// *************** IMPORT LIBRARY ***************
require('dotenv').config();
const { GraphQLError } = require('graphql');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Validates required environment variables.
 * @throws {GraphQLError} CONFIG_MONGO_URI_REQUIRED
 * @throws {GraphQLError} CONFIG_PORT_REQUIRED
 */
function validateEnvironmentVariables() {
  if (!process.env.MONGO_URI) {
    throw new GraphQLError('MONGO_URI is not defined.', {
      extensions: {
        code: 'CONFIG_MONGO_URI_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.PORT) {
    throw new GraphQLError('PORT is not defined.', {
      extensions: {
        code: 'CONFIG_PORT_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.JWT_SECRET) {
    throw new GraphQLError('JWT_SECRET is not defined.', {
      extensions: {
        code: 'CONFIG_JWT_SECRET_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }
}

// *************** GLOBAL VARIABLES ***************
validateEnvironmentVariables();

const applicationConfig = {
  port: process.env.PORT,
  env: process.env.NODE_ENV,
  db: {
    uri: process.env.MONGO_URI,
  },
};

// *************** EXPORT MODULE ***************
module.exports = applicationConfig;
