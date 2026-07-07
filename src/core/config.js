// *************** IMPORT LIBRARY ***************
require('dotenv').config();

// *************** IMPORT MODULE ***************
const { AppError } = require('./errors/');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Validates required environment variables.
 * @throws {AppError} CONFIG_MONGO_URI_REQUIRED
 * @throws {AppError} CONFIG_PORT_REQUIRED
 */
function validateEnvironmentVariables() {
  if (!process.env.MONGO_URI) {
    throw new AppError('CONFIG_MONGO_URI_REQUIRED', 500, 'MONGO_URI is not defined.');
  }

  if (!process.env.PORT) {
    throw new AppError('CONFIG_PORT_REQUIRED', 500, 'PORT is not defined.');
  }

  if (!process.env.JWT_SECRET) {
    throw new AppError('CONFIG_JWT_SECRET_REQUIRED', 500, 'JWT_SECRET is not defined.');
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
