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
const { HandleApiError } = require('./core/errors');
const systemGraphQLModule = require('./features/system');
const { CreateAcademicYearLoader } = require('./loaders/academic_year.loader');
const { InitializeGradeAuditorJob } = require('./jobs/system/missing_grade_auditor.cron');
const { InitializeGradeAggregationIndexes } = require('./features/academic/grading/grading.helper');
const { InitializeReportCardIndexes } = require('./features/academic/grading/grading_report_card.helper');
const { InitializePDFService } = require('./shared/services/pdf.service');

const curriculumModule = require('./features/academic/curriculum');
const studentModule = require('./features/users/student');
const enrollmentModule = require('./features/academic/enrollment');
const gradingModule = require('./features/academic/grading');
const gradingRestRouter = require('./features/academic/grading/grading.rest.router');
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
  typeDefs: [
    directiveTypeDefs,
    systemGraphQLModule.typeDefs,
    curriculumModule.typeDefs,
    studentModule.typeDefs,
    enrollmentModule.typeDefs,
    gradingModule.typeDefs,
    authModule.typeDefs,
  ],
  resolvers: [
    systemGraphQLModule.resolvers,
    curriculumModule.resolvers,
    studentModule.resolvers,
    enrollmentModule.resolvers,
    gradingModule.resolvers,
    authModule.resolvers,
  ],
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

    // *************** Initialize grading indexes once during application startup ***************
    await InitializeGradeAggregationIndexes();

    // *************** Initialize immutable report card indexes before REST downloads are available ***************
    await InitializeReportCardIndexes();

    // *************** Initialize background jobs after database is ready ***************
    await InitializeGradeAuditorJob();

    // *************** Initialize the singleton PDF browser once during application boot ***************
    await InitializePDFService();

    // *************** Configure Express application ***************
    const expressApplication = express();
    expressApplication.use(cors());
    expressApplication.use(express.json());
    expressApplication.use(AuthMiddleware);

    // *************** Register binary REST endpoint before Apollo middleware ***************
    expressApplication.use('/api/academics', gradingRestRouter);

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
          authError: req.authError,
          AcademicYearLoader: CreateAcademicYearLoader(),
        }),
      }),
    );

    // *************** Register centralized REST error logging and response formatting ***************
    expressApplication.use(HandleApiError);

    // *************** Start HTTP server ***************
    expressApplication.listen(applicationConfig.port, () => {
      console.log(`Server is running on port ${applicationConfig.port}`);
    });
  } catch (error) {
    console.error(`[${error.extensions?.httpStatus || 500}] ${error.message}`);

    process.exit(1);
  }
}

// *************** APPLICATION BOOTSTRAP ***************
InitializeApplication();
