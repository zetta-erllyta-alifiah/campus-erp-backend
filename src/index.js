// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');
const { expressMiddleware } = require('@as-integrations/express5');

// *************** IMPORT MODULE ***************
const CreateApolloServer = require('./core/apollo');
const applicationConfig = require('./core/config');
const { ConnectDatabase } = require('./core/db');
const systemGraphQLModule = require('./features/system');
const { CreateAcademicYearLoader } = require('./loaders/academic_year.loader');

const curriculumModule = require('./features/academic/curriculum');
const studentModule = require('./features/users/student');
const enrollmentModule = require('./features/academic/enrollment');

// *************** GLOBAL VARIABLES ***************
const graphQLSchema = {
  typeDefs: [systemGraphQLModule.typeDefs, curriculumModule.typeDefs, studentModule.typeDefs, enrollmentModule.typeDefs],
  resolvers: [systemGraphQLModule.resolvers, curriculumModule.resolvers, studentModule.resolvers, enrollmentModule.resolvers],
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

    // *************** Configure Apollo Server ***************
    const apolloServer = CreateApolloServer(graphQLSchema);
    await apolloServer.start();

    // *************** Register GraphQL endpoint ***************
    expressApplication.use(
      '/graphql',
      expressMiddleware(apolloServer, {
        context: async () => ({
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
