// *************** IMPORT HELPER ***************
const { LoginHelper } = require('./auth.helper');

// *************** IMPORT UTILITIES ***************
const { LogAndNormalizeGqlError } = require('../../../core/errors');

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
    throw await LogAndNormalizeGqlError(error, { source: 'LoginMutation' });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  LoginMutation,
};
