// *************** IMPORT LIBRARY ***************
require('dotenv').config();

// *************** IMPORT MODULE ***************
const { AppError } = require('./errors/');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Validates required environment variables.
 *
 * @throws {AppError} CONFIG_MONGO_URI_REQUIRED
 * @throws {AppError} CONFIG_PORT_REQUIRED
 */
function validateEnvironmentVariables() {
  if (!process.env.MONGO_URI) {
    throw new AppError('MONGO_URI is not defined.', 'CONFIG_MONGO_URI_REQUIRED', 500);
  }

  if (!process.env.PORT) {
    throw new AppError('PORT is not defined.', 'CONFIG_PORT_REQUIRED', 500);
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
