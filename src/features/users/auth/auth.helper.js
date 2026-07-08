// *************** IMPORT LIBRARY ***************
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// *************** IMPORT MODULE ***************
const { CreateGraphQLError } = require('../../../core/errors');
const { UserModel } = require('../user/user.model');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const { LoginValidator } = require('./auth.validator');

// *************** MUTATION ***************

/**
 * Authenticates a user and issues a signed JWT.
 *
 * @param {Object} input - Login credentials.
 * @returns {Promise<string>} Signed JWT token.
 * @throws {GraphQLError} 401 - Invalid email or password.
 */
async function LoginHelper(input) {
  // *************** Validate and sanitize login payload before authentication
  const validatedInput = ValidateInputWithJoi(LoginValidator, input);

  // *************** Normalize email casing so login matches stored lowercase emails
  const normalizedEmail = validatedInput.email.toLowerCase();

  // *************** Find the user account associated with the provided email
  const user = await UserModel.findOne({ email: normalizedEmail });

  // *************** Return a generic auth error to avoid exposing which credential failed
  if (!user) {
    throw CreateGraphQLError('UNAUTHORIZED', 401, 'Invalid email or password');
  }

  // *************** Compare the submitted password against the stored password hash
  const isPasswordValid = await bcrypt.compare(validatedInput.password, user.password);

  // *************** Keep the same generic auth error for invalid password attempts
  if (!isPasswordValid) {
    throw CreateGraphQLError('UNAUTHORIZED', 401, 'Invalid email or password');
  }

  // *************** Sign the access token with identity and role claims for authorization
  const token = jwt.sign(
    {
      userId: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '8h',
    },
  );

  return token;
}

// *************** EXPORT MODULE ***************
module.exports = {
  LoginHelper,
};
