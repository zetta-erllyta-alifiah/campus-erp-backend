/**
 * Academic grading REST middleware.
 *
 * Responsibility:
 * - Protect report card download routes with authorization.
 * - Keep REST route definitions free from business checks.
 */

// *************** IMPORT MODULE ***************
const {
  ValidateReportCardAccess,
  ValidateReportCardIssuanceAccess,
  ValidateReportCardRouteParams,
  ValidateReportCardVersionRouteParams,
} = require('./grading_report_card.helper');

// *************** MIDDLEWARE ***************

/**
 * Validates and sanitizes report card route identifiers before downstream use.
 *
 * @param {Object} request - Express request object.
 * @param {Object} response - Express response object.
 * @param {Function} next - Express next middleware.
 * @returns {void}
 */
function ValidateReportCardParamsMiddleware(request, response, next) {
  try {
    request.reportCardParams = request.params.version
      ? ValidateReportCardVersionRouteParams(request.params)
      : ValidateReportCardRouteParams(request.params);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Allows only authenticated users with explicit access to the requested report card.
 *
 * @param {Object} request - Express request object.
 * @param {Object} response - Express response object.
 * @param {Function} next - Express next middleware.
 * @returns {Promise<void>}
 */
async function AuthorizeReportCardAccessMiddleware(request, response, next) {
  try {
    const authorizedParams = await ValidateReportCardAccess({
      academicYearId: request.reportCardParams.academicYearId,
      studentId: request.reportCardParams.studentId,
      user: request.user,
    });
    request.reportCardParams = {
      ...request.reportCardParams,
      ...authorizedParams,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Allows only explicitly authorized administrators to issue report cards.
 *
 * @param {Object} request - Express request object.
 * @param {Object} response - Express response object.
 * @param {Function} next - Express next middleware.
 * @returns {Promise<void>}
 */
async function AuthorizeReportCardIssuanceMiddleware(request, response, next) {
  try {
    const authorizedParams = await ValidateReportCardIssuanceAccess({
      academicYearId: request.reportCardParams.academicYearId,
      studentId: request.reportCardParams.studentId,
      user: request.user,
    });
    request.reportCardParams = {
      ...request.reportCardParams,
      ...authorizedParams,
    };

    next();
  } catch (error) {
    next(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  AuthorizeReportCardAccessMiddleware,
  AuthorizeReportCardIssuanceMiddleware,
  ValidateReportCardParamsMiddleware,
};
