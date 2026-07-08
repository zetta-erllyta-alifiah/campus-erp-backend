// *************** IMPORT LIBRARY ***************
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils');
const { defaultFieldResolver } = require('graphql');

// *************** IMPORT MODULE ***************
const { CreateGraphQLError } = require('../../core/errors');

// *************** GLOBAL VARIABLES ***************
const ROLE_ALIASES = {
  admin: 'ADMIN',
  teacher: 'TEACHER',
};

const ROLE_HIERARCHY = {
  TEACHER: 1,
  ADMIN: 2,
};

// *************** HELPER FUNCTION ***************

/**
 * Converts persisted role values into GraphQL enum-style role values.
 *
 * @param {string} role - Role from directive arguments or JWT payload.
 * @returns {string|undefined} Normalized role value.
 */
function NormalizeRole(role) {
  return ROLE_ALIASES[role?.toLowerCase()];
}

/**
 * Throws the most specific authentication failure available in GraphQL context.
 *
 * @param {Object} context - GraphQL request context.
 * @returns {void}
 * @throws {GraphQLError} 401 - Missing, invalid, expired, or inactive JWT.
 */
function ThrowAuthenticationError(context) {
  // *************** Preserve JWT verification failure instead of masking it as missing auth
  if (context?.authError) {
    throw CreateGraphQLError(
      context.authError.code,
      context.authError.httpStatus,
      context.authError.message,
      context.authError.meta,
    );
  }

  // *************** Reject protected fields when no authenticated user context exists
  throw CreateGraphQLError('UNAUTHENTICATED', 401, 'Authentication required');
}

/**
 * Applies the custom @auth directive to protected GraphQL fields.
 *
 * @param {Object} schema - Executable GraphQL schema.
 * @param {string} directiveName - Name of the directive to apply.
 * @returns {Object} Transformed schema.
 */
function AuthDirectiveTransformer(schema, directiveName) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, target) => {
      // *************** Read the auth directive configuration from the current GraphQL field
      const directive = getDirective(schema, fieldConfig, directiveName)?.[0];

      // *************** Leave public fields unchanged when no auth directive is attached
      if (!directive) {
        return fieldConfig;
      }

      // *************** Preserve the original resolver so authorization wraps existing behavior
      const { resolve = defaultFieldResolver } = fieldConfig;

      fieldConfig.resolve = async function resolveWithAuthorization(source, args, context, info) {
        // *************** Require authenticated user context before resolving protected fields
        if (!context.user) {
          ThrowAuthenticationError(context);
        }

        // *************** Resolve required role from directive and compare it with the user role
        const requiredRole = NormalizeRole(directive.requires || 'ADMIN');
        const userRole = NormalizeRole(context.user.role);

        // *************** Reject users whose role is lower than the required directive role
        if ((ROLE_HIERARCHY[userRole] || 0) < (ROLE_HIERARCHY[requiredRole] || 0)) {
          throw CreateGraphQLError('FORBIDDEN', 403, 'Forbidden');
        }

        // *************** Continue to the original resolver after authorization succeeds
        return resolve(source, args, context, info);
      };

      return fieldConfig;
    },
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  AuthDirectiveTransformer,
};
