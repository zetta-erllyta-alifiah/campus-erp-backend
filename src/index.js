// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');
const { expressMiddleware } = require('@as-integrations/express5');

// *************** IMPORT MODULE ***************
const createApolloServer = require('./core/apollo');
const server = createApolloServer();
const config = require('./core/config');
const { connectDB } = require('./core/db');

// *************** IMPORT HELPER FUNCTION ***************
async function startServer() {
    try {
        await connectDB();

        const app = express();

        app.use(cors());
        app.use(express.json());

        const server = createApolloServer();

        await server.start();

        app.use(
            '/graphql',
            expressMiddleware(server)
        );

        app.listen(config.port, () => {
            console.log(
                `Server is running on port ${config.port}`
            );
        });
    } catch (error) {
        console.error(
            `[${error.statusCode || 500}] ${error.message}`
        );

        process.exit(1);
    }
}

// *************** APPLICATION BOOTSTRAP ***************
startServer();