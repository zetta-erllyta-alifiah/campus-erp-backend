// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');
const { expressMiddleware } = require('@as-integrations/express5');

// *************** IMPORT MODULE ***************
const CreateApolloServer = require('./core/apollo');
const applicationConfig = require('./core/config');
const { ConnectDatabase } = require('./core/db');
const systemGraphQLModule = require('./features/system');

const curriculumModule = require('./features/academic/curriculum');
const studentModule = require('./features/users/student');
const enrollmentModule = require('./features/academic/enrollment');

// *************** GLOBAL VARIABLES ***************
const graphQLSchema = {
  typeDefs: [
    systemGraphQLModule.typeDefs, 
    curriculumModule.typeDefs, 
    studentModule.typeDefs, 
    enrollmentModule.typeDefs
  ], resolvers: [
    systemGraphQLModule.resolvers,
    curriculumModule.resolvers, 
    studentModule.resolvers, 
    enrollmentModule.resolvers
  ],
};

// *************** IMPORT HELPER FUNCTION ***************
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
async function initializeApplication() {
  try {
    // *************** START: Initialize database connection ***************
    await ConnectDatabase();
    // *************** END: Initialize database connection ***************

    // *************** START: Configure Express application ***************
    const expressApplication = express();

    expressApplication.use(cors());

    expressApplication.use(express.json());
    // *************** END: Configure Express application ***************

    // *************** START:Configure Apollo Server ***************
    const apolloServer = CreateApolloServer(graphQLSchema);

    await apolloServer.start();
    // *************** END: Configure Apollo Server ***************

    // *************** START: Register GraphQL endpoint ***************
    expressApplication.use('/graphql', expressMiddleware(apolloServer));
    // *************** END: Register GraphQL endpoint ***************

    // *************** START: Start HTTP server ***************
    expressApplication.listen(applicationConfig.port, () => {
      console.log(`Server is running on port ${applicationConfig.port}`);
    });
    // *************** END: Start HTTP server ***************
  } catch (error) {
    console.error(`[${error.httpStatus || 500}] ${error.message}`);

    process.exit(1);
  }
}

// *************** APPLICATION BOOTSTRAP ***************
initializeApplication();
