// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');
const { gql } = require('graphql-tag');
const { expressMiddleware } = require('@as-integrations/express5');
const { makeExecutableSchema } = require('@graphql-tools/schema');

// *************** IMPORT MODULE ***************
const CreateApolloServer = require('./core/apollo');
const applicationConfig = require('./core/config');
const { ConnectDatabase } = require('./core/db');
const systemGraphQLModule = require('./features/system');
const { CreateAcademicYearLoader } = require('./loaders/academic_year.loader');

const curriculumModule = require('./features/academic/curriculum');
const studentModule = require('./features/users/student');
const enrollmentModule = require('./features/academic/enrollment');
const authModule = require('./features/users/auth');
const AuthMiddleware = require('./shared/middlewares/auth.middleware');
const { AuthDirectiveTransformer } = require('./shared/directives/auth.directive');

// *************** GLOBAL VARIABLES ***************
const directiveTypeDefs = gql`
  directive @auth(requires: Role = ADMIN) on FIELD_DEFINITION

  enum Role {
    ADMIN
    TEACHER
  }
`;

const graphQLSchema = {
  typeDefs: [directiveTypeDefs, systemGraphQLModule.typeDefs, curriculumModule.typeDefs, studentModule.typeDefs, enrollmentModule.typeDefs, authModule.typeDefs],
  resolvers: [systemGraphQLModule.resolvers, curriculumModule.resolvers, studentModule.resolvers, enrollmentModule.resolvers, authModule.resolvers],
};

// *************** APPLICATION BOOTSTRAP ***************
/**
 * Initializes the application
 * runtime environment.
 *
 * Responsibilities:
 * - Connect to MongoDB.
 * - Initialize Express.
 * - Configure middleware.
 * - Start Apollo Server.
 * - Expose GraphQL endpoint.
 * @returns {Promise<void>}
 */
async function InitializeApplication() {
  try {
    // *************** Initialize database connection ***************
    await ConnectDatabase();

    // *************** Configure Express application ***************
    const expressApplication = express();
    expressApplication.use(cors());
    expressApplication.use(express.json());
    expressApplication.use(AuthMiddleware);

    // *************** Configure Apollo Server ***************
    const executableSchema = makeExecutableSchema({
      typeDefs: graphQLSchema.typeDefs,
      resolvers: graphQLSchema.resolvers,
    });
    const transformedSchema = AuthDirectiveTransformer(executableSchema, 'auth');
    const apolloServer = CreateApolloServer({ schema: transformedSchema });
    await apolloServer.start();

    // *************** Register GraphQL endpoint ***************
    expressApplication.use(
      '/graphql',
      expressMiddleware(apolloServer, {
        context: async ({ req }) => ({
          user: req.user,
          AcademicYearLoader: CreateAcademicYearLoader(),
        }),
      }),
    );

    // *************** Start HTTP server ***************
    expressApplication.listen(applicationConfig.port, () => {
      console.log(`Server is running on port ${applicationConfig.port}`);
    });
  } catch (error) {
    console.error(`[${error.httpStatus || 500}] ${error.message}`);

    process.exit(1);
  }
}

// *************** APPLICATION BOOTSTRAP ***************
InitializeApplication();
