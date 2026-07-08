// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const applicationConfig = require('./config');
const { CreateGraphQLError } = require('./errors/');

// *************** IMPORT HELPER FUNCTION ***************
/**
 * Establishes a connection to the MongoDB database.
 * @returns {Promise<void>} Resolves when the database connection is established.
 * @throws {GraphQLError} DATABASE_CONNECTION_FAILED - Failed to connect to MongoDB.
 */
async function ConnectDatabase() {
  try {
    await mongoose.connect(applicationConfig.db.uri);

    console.log('MongoDB connection initialized');
  } catch (connectionError) {
    console.error('MongoDB connection failed:', connectionError);

    throw CreateGraphQLError('DATABASE_CONNECTION_FAILED', 500, 'Failed to connect to MongoDB');
  }
}

// *************** GLOBAL VARIABLES ***************
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (connectionError) => {
  console.error('MongoDB connection error:', connectionError);
});

// *************** EXPORT MODULE ***************
module.exports = {
  ConnectDatabase,
};
