// *************** IMPORT LIBRARY ***************
require('dotenv').config();
const { GraphQLError } = require('graphql');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Validates required environment variables.
 *
 * @returns {void}
 * @throws {GraphQLError} CONFIG_MONGO_URI_REQUIRED
 * @throws {GraphQLError} CONFIG_PORT_REQUIRED
 * @throws {GraphQLError} CONFIG_JWT_SECRET_REQUIRED
 * @throws {GraphQLError} CONFIG_SMTP_HOST_REQUIRED
 * @throws {GraphQLError} CONFIG_SMTP_PORT_REQUIRED
 * @throws {GraphQLError} CONFIG_SMTP_USER_REQUIRED
 * @throws {GraphQLError} CONFIG_SMTP_PASS_REQUIRED
 * @throws {GraphQLError} CONFIG_WEBHOOK_WAREHOUSE_URL_REQUIRED
 * @throws {GraphQLError} CONFIG_WEBHOOK_WAREHOUSE_SECRET_REQUIRED
 */
function ValidateEnvironmentVariables() {
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

  if (!process.env.SMTP_HOST) {
    throw new GraphQLError('SMTP_HOST is not defined.', {
      extensions: {
        code: 'CONFIG_SMTP_HOST_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.SMTP_PORT) {
    throw new GraphQLError('SMTP_PORT is not defined.', {
      extensions: {
        code: 'CONFIG_SMTP_PORT_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.SMTP_USER) {
    throw new GraphQLError('SMTP_USER is not defined.', {
      extensions: {
        code: 'CONFIG_SMTP_USER_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.SMTP_PASS) {
    throw new GraphQLError('SMTP_PASS is not defined.', {
      extensions: {
        code: 'CONFIG_SMTP_PASS_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.WEBHOOK_WAREHOUSE_URL) {
    throw new GraphQLError('WEBHOOK_WAREHOUSE_URL is not defined.', {
      extensions: {
        code: 'CONFIG_WEBHOOK_WAREHOUSE_URL_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }

  if (!process.env.WEBHOOK_WAREHOUSE_SECRET) {
    throw new GraphQLError('WEBHOOK_WAREHOUSE_SECRET is not defined.', {
      extensions: {
        code: 'CONFIG_WEBHOOK_WAREHOUSE_SECRET_REQUIRED',
        httpStatus: 500,
        meta: null,
      },
    });
  }
}

// *************** GLOBAL VARIABLES ***************
ValidateEnvironmentVariables();

const applicationConfig = {
  port: process.env.PORT,
  env: process.env.NODE_ENV,
  db: {
    uri: process.env.MONGO_URI,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  webhook: {
    warehouseUrl: process.env.WEBHOOK_WAREHOUSE_URL,
    warehouseSecret: process.env.WEBHOOK_WAREHOUSE_SECRET,
  },
};

// *************** EXPORT MODULE ***************
module.exports = applicationConfig;
