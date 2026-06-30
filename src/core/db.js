// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const config = require('./config');
const { AppError } = require('./errors');

// *************** IMPORT HELPER FUNCTION ***************

/**
 * Establishes a connection to the MongoDB database using Mongoose.
 *
 * @returns {Promise<void>} Resolves when the database connection is established.
 * @throws {AppError} 500 - Failed to connect to MongoDB.
 */
async function connectDB() {
    try {
        await mongoose.connect(config.db.uri);
        console.log('MongoDB connection initialized');
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        throw new AppError('Failed to connect to MongoDB', 500);
    }
}

// *************** GLOBAL VARIABLES ***************

mongoose.connection.on('connected', () => {
    console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

// *************** EXPORT MODULE ***************
module.exports = { connectDB };