// *************** QUERY ***************
/**
 * Returns the application health status.
 *
 * @returns {string} The application health status.
 */
function Ping() {
    return 'pong';
}

// *************** EXPORT MODULE ***************
module.exports = {
    Ping,
};