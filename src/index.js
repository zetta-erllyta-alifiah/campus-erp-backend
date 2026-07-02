// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');
const {
    expressMiddleware,
} = require('@as-integrations/express5');

// *************** IMPORT MODULE ***************
const CreateApolloServer =
    require('./core/apollo');

const applicationConfig =
    require('./core/config');

const {
    ConnectDatabase,
} = require('./core/db');

const systemGraphQLModule =
    require('./features/system');

const curriculumModule =
    require(
        './features/academic/curriculum'
    );

// *************** GLOBAL VARIABLES ***************
const graphQLSchema = {
    typeDefs: [
        systemGraphQLModule.typeDefs,
        curriculumModule.typeDefs,
    ],

    resolvers: [
        systemGraphQLModule.resolvers,
        curriculumModule.resolvers,
    ],
};

// *************** IMPORT HELPER FUNCTION ***************
async function initializeApplication() {
    try {
        await ConnectDatabase();

        const expressApplication =
            express();

        expressApplication.use(
            cors()
        );

        expressApplication.use(
            express.json()
        );

        const apolloServer =
            CreateApolloServer(
            graphQLSchema
        );

        await apolloServer.start();

        expressApplication.use(
            '/graphql',
            expressMiddleware(
                apolloServer
            )
        );

        expressApplication.listen(
            applicationConfig.port,
            () => {
                console.log(
                    `Server is running on port ${applicationConfig.port}`
                );
            }
        );
    } catch (error) {
        console.error(
            `[${error.httpStatus || 500}] ${error.message}`
        );

        process.exit(1);
    }
}

// *************** APPLICATION BOOTSTRAP ***************
initializeApplication();