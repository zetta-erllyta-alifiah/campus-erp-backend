// *************** IMPORT LIBRARY ***************
require('dotenv').config()

// *************** IMPORT MODULE ***************
const { AppError } = require('./errors');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Validates the presence of required environment variables and exports the configuration object.
 * 
 * @throws {AppError} If MONGO_URI is not defined in the environment variables.
 * @throws {AppError} If PORT is not defined in the environment variables.
 */

function validateEnvVariables() {
    if (!process.env.MONGO_URI) {
        throw new AppError(
            'MONGO_URI is not defined.',
            'CONFIG_MONGO_URI_REQUIRED',
            500
        );
    }

    if (!process.env.PORT) {
        throw new AppError(
            'PORT is not defined.',
            'CONFIG_PORT_REQUIRED',
            500
        );
    }
}

// *************** GLOBAL VARIABLES ***************
validateEnvVariables();

const config = {
    port: process.env.PORT,
    env: process.env.NODE_ENV,
    db: {
        uri: process.env.MONGO_URI,
    },
}

// *************** EXPORT MODULE ***************
module.exports = config;