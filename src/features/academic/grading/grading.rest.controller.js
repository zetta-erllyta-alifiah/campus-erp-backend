/**
 * Academic grading REST controller.
 *
 * Responsibility:
 * - Coordinate official report card PDF generation.
 * - Set binary response headers.
 * - Stream generated PDFs directly to the HTTP response.
 */

// *************** IMPORT MODULE ***************
const { GeneratePDFStream } = require('../../../shared/services/pdf.service');
const {
  GenerateReportCardHtml,
  GenerateReportCardVersionHtml,
  IssueReportCard,
  ReissueReportCard,
} = require('./grading_report_card.helper');

// *************** CONTROLLER ***************

/**
 * Streams an official student report card for one academic year.
 *
 * @param {Object} request - Express request containing academicYearId and studentId.
 * @param {Object} response - Express response receiving the PDF stream.
 * @param {Function} next - Express error continuation callback.
 * @param {Function} generateReportCardDocument - Helper that loads one immutable HTML snapshot.
 * @returns {Promise<void>}
 */
async function streamReportCardPdf(request, response, next, generateReportCardDocument) {
  let pdfStream = null;

  try {
    // *************** START: Load verified immutable report card HTML ***************
    const reportCardDocument = await generateReportCardDocument({
      ...request.reportCardParams,
      user: request.user,
    });
    // *************** END: Load verified immutable report card HTML ***************

    // *************** START: Stream generated PDF response ***************
    pdfStream = await GeneratePDFStream(reportCardDocument.htmlContent);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${reportCardDocument.fileName}"`);
    response.setHeader('Cache-Control', 'private, no-store');

    // *************** Forward rendering stream failures to the centralized REST error middleware
    pdfStream.once('error', next);

    // *************** Stop rendering work if the client aborts the download
    response.once('close', () => {
      if (pdfStream && !pdfStream.readableEnded && !pdfStream.destroyed) {
        pdfStream.destroy();
      }
    });

    pdfStream.pipe(response);
    // *************** END: Stream generated PDF response ***************
  } catch (error) {
    // *************** Route every controller failure through centralized REST handling
    next(error);
  }
}

/**
 * Streams the current final student report card version.
 *
 * @param {Object} request - Express request with validated reportCardParams.
 * @param {Object} response - Express response receiving the PDF stream.
 * @param {Function} next - Express error continuation callback.
 * @returns {Promise<void>}
 */
async function StreamReportCardController(request, response, next) {
  await streamReportCardPdf(request, response, next, GenerateReportCardHtml);
}

/**
 * Streams one immutable historical student report card version.
 *
 * @param {Object} request - Express request with validated version parameters.
 * @param {Object} response - Express response receiving the PDF stream.
 * @param {Function} next - Express error continuation callback.
 * @returns {Promise<void>}
 */
async function StreamReportCardVersionController(request, response, next) {
  await streamReportCardPdf(request, response, next, GenerateReportCardVersionHtml);
}

/**
 * Issues the first official immutable report card version.
 *
 * @param {Object} request - Express request with validated route and user data.
 * @param {Object} response - Express JSON response.
 * @param {Function} next - Express error continuation callback.
 * @returns {Promise<void>}
 */
async function IssueReportCardController(request, response, next) {
  try {
    const issuanceResult = await IssueReportCard({
      ...request.reportCardParams,
      user: request.user,
    });

    response.status(201).json({
      status: 'success',
      data: issuanceResult,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Issues a corrected version and supersedes the previous final report card.
 *
 * @param {Object} request - Express request with validated route and user data.
 * @param {Object} response - Express JSON response.
 * @param {Function} next - Express error continuation callback.
 * @returns {Promise<void>}
 */
async function ReissueReportCardController(request, response, next) {
  try {
    const issuanceResult = await ReissueReportCard({
      ...request.reportCardParams,
      user: request.user,
    });

    response.status(201).json({
      status: 'success',
      data: issuanceResult,
    });
  } catch (error) {
    next(error);
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  IssueReportCardController,
  ReissueReportCardController,
  StreamReportCardController,
  StreamReportCardVersionController,
};
