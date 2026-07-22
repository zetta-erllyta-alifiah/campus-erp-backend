/**
 * Academic grading REST router.
 *
 * Responsibility:
 * - Define REST routes for academic grading report card downloads.
 * - Keep route definitions free from business, template, PDF, and streaming logic.
 * - Apply authentication, validation, authorization, and rate limiting before controllers run.
 */

// *************** IMPORT LIBRARY ***************
const express = require('express');

// *************** IMPORT MODULE ***************
const { CreateRateLimitMiddleware } = require('../../../shared/middlewares/rate_limit.middleware');
const { RequireAuthenticatedRestRequest } = require('../../../shared/middlewares/rest_auth.middleware');
const {
  AuthorizeReportCardAccessMiddleware,
  ValidateReportCardParamsMiddleware,
} = require('./grading.rest.middleware');
const {
  StreamReportCardController,
  StreamReportCardVersionController,
} = require('./grading.rest.controller');

// *************** GLOBAL VARIABLES ***************

// *************** Dedicated REST router mounted outside the GraphQL endpoint
const gradingRestRouter = express.Router();

// *************** Limit PDF downloads because rendering is CPU and memory sensitive
const reportCardDownloadRateLimit = CreateRateLimitMiddleware({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  code: 'REPORT_CARD_RATE_LIMIT_EXCEEDED',
  message: 'Too many report card download requests',
  keyGenerator: (request) => {
    const actorKey = request.user?.userId || request.ip || request.socket?.remoteAddress || 'unknown';

    return `report-card:${String(actorKey)}`;
  },
});

// *************** REST ROUTE ***************

/**
 * Downloads the current official immutable report card PDF.
 *
 * Flow:
 * - Authenticate the REST request.
 * - Validate academicYearId and studentId.
 * - Authorize report card access.
 * - Load the existing final report card snapshot.
 * - If no final snapshot exists yet, create the first immutable snapshot from Student and AcademicStanding.
 * - Render the snapshot HTML as a PDF stream.
 *
 * Method: GET
 * Path: /report-card/:academicYearId/:studentId
 */
gradingRestRouter.get(
  '/report-card/:academicYearId/:studentId',
  RequireAuthenticatedRestRequest,
  ValidateReportCardParamsMiddleware,
  reportCardDownloadRateLimit,
  AuthorizeReportCardAccessMiddleware,
  StreamReportCardController,
);

/**
 * Downloads one immutable historical report card PDF version.
 *
 * This route supports audit/history access. It only reads an existing immutable snapshot
 * and never creates a new report card version.
 *
 * Method: GET
 * Path: /report-card/:academicYearId/:studentId/versions/:version
 */
gradingRestRouter.get(
  '/report-card/:academicYearId/:studentId/versions/:version',
  RequireAuthenticatedRestRequest,
  ValidateReportCardParamsMiddleware,
  reportCardDownloadRateLimit,
  AuthorizeReportCardAccessMiddleware,
  StreamReportCardVersionController,
);

// *************** EXPORT ROUTER MODULE ***************
module.exports = gradingRestRouter;
