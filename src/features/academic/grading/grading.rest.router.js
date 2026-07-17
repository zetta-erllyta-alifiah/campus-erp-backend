/**
 * Academic grading REST router.
 *
 * Responsibility:
 * - Define REST routes for academic grading resources.
 * - Keep route definitions free from business, template, and streaming logic.
 */

// *************** IMPORT LIBRARY ***************
const express = require('express');

// *************** IMPORT MODULE ***************
const { CreateRateLimitMiddleware } = require('../../../shared/middlewares/rate_limit.middleware');
const { RequireAuthenticatedRestRequest } = require('../../../shared/middlewares/rest_auth.middleware');
const {
  AuthorizeReportCardAccessMiddleware,
  AuthorizeReportCardIssuanceMiddleware,
  ValidateReportCardParamsMiddleware,
} = require('./grading.rest.middleware');
const {
  IssueReportCardController,
  ReissueReportCardController,
  StreamReportCardController,
  StreamReportCardVersionController,
} = require('./grading.rest.controller');

// *************** GLOBAL VARIABLES ***************

// Dedicated router mounted outside the GraphQL endpoint.
const gradingRestRouter = express.Router();

// Report card PDF downloads are limited to 10 requests per 10 minutes.
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
 * Downloads an official immutable report card PDF.
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
 */
gradingRestRouter.get(
  '/report-card/:academicYearId/:studentId/versions/:version',
  RequireAuthenticatedRestRequest,
  ValidateReportCardParamsMiddleware,
  reportCardDownloadRateLimit,
  AuthorizeReportCardAccessMiddleware,
  StreamReportCardVersionController,
);

/**
 * Issues the first official immutable report card version.
 */
gradingRestRouter.post(
  '/report-card/:academicYearId/:studentId/issue',
  RequireAuthenticatedRestRequest,
  ValidateReportCardParamsMiddleware,
  AuthorizeReportCardIssuanceMiddleware,
  IssueReportCardController,
);

/**
 * Issues a corrected version without overwriting report card history.
 */
gradingRestRouter.post(
  '/report-card/:academicYearId/:studentId/reissue',
  RequireAuthenticatedRestRequest,
  ValidateReportCardParamsMiddleware,
  AuthorizeReportCardIssuanceMiddleware,
  ReissueReportCardController,
);

// *************** EXPORT MODULE ***************
module.exports = gradingRestRouter;
