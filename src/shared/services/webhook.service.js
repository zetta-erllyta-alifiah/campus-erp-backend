/**
 * Outbound webhook service.
 *
 * Responsibility:
 * - Format academic standing webhook payloads.
 * - Authenticate outbound analytics requests.
 * - Log delivery failures without interrupting the worker thread.
 */

// *************** IMPORT MODULE ***************
const config = require("../../core/config");
const { AppError } = require("../../core/errors");

// *************** GLOBAL VARIABLES ***************

// *************** Stable event name consumed by the external analytics warehouse
const ACADEMIC_STANDINGS_UPDATED = "ACADEMIC_STANDINGS_UPDATED";

// *************** SERVICE ***************

/**
 * Dispatches calculated academic standings to the configured analytics webhook.
 *
 * Webhook delivery is intentionally non-critical. Failures are logged and not
 * re-thrown because AcademicStanding persistence has already succeeded.
 *
 * @param {Array<Object>} standingsArray - Fully calculated academic standing objects.
 * @returns {Promise<void>}
 */
async function DispatchAcademicStandings(standingsArray) {
  try {
    // *************** START: Validate webhook payload ***************
    if (!Array.isArray(standingsArray)) {
      throw new AppError(
        "INVALID_WEBHOOK_PAYLOAD",
        500,
        "Academic standings webhook payload must be an array",
        {
          received_type: typeof standingsArray,
        },
      );
    }
    // *************** END: Validate webhook payload ***************

    // *************** START: Build webhook payload ***************
    const payload = {
      // *************** Identify the event type expected by the external analytics consumer
      event: ACADEMIC_STANDINGS_UPDATED,

      // *************** Capture the exact dispatch time in a portable ISO timestamp
      timestamp: new Date().toISOString(),

      // *************** Send final standing snapshots instead of MongoDB bulkWrite commands
      data: standingsArray,
    };
    // *************** END: Build webhook payload ***************

    // *************** START: Dispatch webhook request ***************
    const response = await fetch(config.webhook.warehouseUrl, {
      method: "POST",
      headers: {
        // *************** Declare the outbound payload format
        "Content-Type": "application/json",

        // *************** Authenticate this ERP service to the external warehouse consumer
        "x-api-key": config.webhook.warehouseSecret,
      },
      body: JSON.stringify(payload),
    });
    // *************** END: Dispatch webhook request ***************

    // *************** START: Validate webhook response ***************
    if (!response.ok) {
      throw new AppError(
        "WEBHOOK_DISPATCH_FAILED",
        502,
        "External analytics webhook rejected the request",
        {
          event: ACADEMIC_STANDINGS_UPDATED,
          response_status: response.status,
          record_count: standingsArray.length,
        },
      );
    }
    // *************** END: Validate webhook response ***************
  } catch (error) {
    // *************** Log non-critical delivery failure without interrupting the worker thread
    console.error(`Failed to dispatch webhook: ${error.message}`);

    // *************** Do not re-throw because AcademicStanding persistence has already succeeded
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  DispatchAcademicStandings,
};
