// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * User schema used for authentication and role-based access control.
 *
 * Responsibilities:
 * - Store credential data for authenticated users.
 * - Track role-based permissions for protected mutations.
 */
const UserSchema = new mongoose.Schema(
  {
    // Official email address used for account login.
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    // Hashed password used for authentication.
    password: {
      type: String,
      required: true,
    },

    // Role assigned to the account for authorization checks.
    role: {
      type: String,
      required: true,
      enum: ['admin', 'teacher'],
    },
  },
  {
    timestamps: true,
  },
);

// *************** GLOBAL VARIABLES ***************
const UserModel = mongoose.model('User', UserSchema);

// *************** EXPORT MODULE ***************
module.exports = {
  UserModel,
};
