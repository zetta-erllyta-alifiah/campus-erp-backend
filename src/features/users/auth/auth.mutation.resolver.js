// *************** IMPORT MODULE ***************
const { LoginHelper } = require('./auth.helper');
const { NormalizeGqlError } = require('../../../core/errors');

// *************** MUTATION ***************

/**
 * GraphQL mutation resolver for user login.
 *
 * @param {Object} _
 * @param {Object} args
 * @returns {Promise<string>}
 */
async function LoginMutation(_, args) {
  try {
    const { input } = args;

    return await LoginHelper(input);
  } catch (error) {
    throw NormalizeGqlError(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  LoginMutation,
};
