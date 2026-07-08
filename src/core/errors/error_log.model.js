// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Mongoose schema for persisting application error logs.
 *
 * Responsibility:
 * - Store operational and unexpected GraphQL errors.
 * - Preserve enough context for debugging without blocking the original response.
 */
const ErrorLogSchema = new mongoose.Schema(
  {
    // Error message text (human readable). Used for quick debugging and log inspection.
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Stable error code identifier (e.g., AppError.code). Enables filtering and analytics.
    code: {
      type: String,
      required: true,
      trim: true,
    },

    // HTTP status associated with the error. Helps map errors to transport semantics.
    http_status: {
      type: Number,
      default: 500,
    },

    // Origin of the error within the application (e.g., 'graphql', 'auth').
    source: {
      type: String,
      default: 'graphql',
      trim: true,
    },

    // Optional stack trace for deep debugging. Kept null when stack is not available.
    stack: {
      type: String,
      default: null,
    },

    // Additional structured/unstructured metadata useful for debugging.
    // Stored as Mixed to support different error shapes across the codebase.
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },

    // Dedicated MongoDB collection for error logs.
    collection: 'error_logs',
  },
);

// *************** GLOBAL VARIABLES ***************

/**
 * Compiled Mongoose model used for writing and querying error log documents.
 */
const ErrorLogModel = mongoose.model('ErrorLog', ErrorLogSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  ErrorLogModel,
};

