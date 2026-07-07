// *************** IMPORT LIBRARY ***************
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils');
const { defaultFieldResolver } = require('graphql');

// *************** IMPORT MODULE ***************
const { AppError } = require('../../core/errors');

// *************** GLOBAL VARIABLES ***************
const ROLE_ALIASES = {
  admin: 'ADMIN',
  teacher: 'TEACHER',
};

const ROLE_HIERARCHY = {
  TEACHER: 1,
  ADMIN: 2,
};

// *************** MUTATION ***************

/**
 * Converts persisted role values into GraphQL enum-style role values.
 *
 * @param {string} role - Role from directive arguments or JWT payload.
 * @returns {string|undefined} Normalized role value.
 */
function normalizeRole(role) {
  return ROLE_ALIASES[role?.toLowerCase()];
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
          throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
        }

        // *************** Resolve required role from directive and compare it with the user role
        const requiredRole = normalizeRole(directive.requires || 'ADMIN');
        const userRole = normalizeRole(context.user.role);

        // *************** Reject users whose role is lower than the required directive role
        if ((ROLE_HIERARCHY[userRole] || 0) < (ROLE_HIERARCHY[requiredRole] || 0)) {
          throw new AppError('FORBIDDEN', 403, 'Forbidden');
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
