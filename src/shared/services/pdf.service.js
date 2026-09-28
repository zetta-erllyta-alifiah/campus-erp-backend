/**
 * PDF generation service.
 *
 * Responsibility:
 * - Own the singleton Puppeteer browser lifecycle.
 * - Render HTML into an A4 PDF stream.
 * - Release each lightweight page after its stream completes or fails.
 */

// *************** IMPORT CORE ***************
const { Readable } = require('node:stream');

// *************** IMPORT LIBRARY ***************
const puppeteer = require('puppeteer');

// *************** IMPORT MODULE ***************
const { AppError } = require('../../core/errors');

// *************** GLOBAL VARIABLES ***************

// Singleton browser shared by every report card request in this process.
let browserInstance = null;

// Shared initialization promise prevents concurrent callers from launching multiple browsers.
let browserInitializationPromise = null;

// *************** SERVICE HELPER FUNCTION ***************

/**
 * Closes a Puppeteer page without allowing cleanup failures to become unhandled rejections.
 *
 * @param {Object|null} page - Puppeteer page to close.
 * @returns {Promise<void>}
 */
async function closePageSafely(page) {
  if (!page || page.isClosed()) {
    return;
  }

  try {
    await page.close();
  } catch (pageCloseError) {
    console.error(`Failed to close PDF page: ${pageCloseError.message}`);
  }
}

/**
 * Converts Puppeteer's Web ReadableStream into the Node.js stream expected by Express.
 *
 * @param {ReadableStream|Readable} pdfStream - Stream returned by Puppeteer.
 * @returns {Readable} Node.js readable PDF stream.
 */
function createNodePDFStream(pdfStream) {
  if (typeof pdfStream.pipe === 'function') {
    return pdfStream;
  }

  return Readable.fromWeb(pdfStream);
}

// *************** SERVICE FUNCTION ***************

/**
 * Launches and returns the process-wide Puppeteer browser singleton.
 *
 * Repeated or concurrent calls reuse the same launch operation and never create
 * a browser per request.
 *
 * @returns {Promise<Object>} Initialized Puppeteer browser instance.
 * @throws {AppError} 500 - Browser initialization failed.
 */
async function InitializePDFService() {
  if (browserInstance?.connected) {
    return browserInstance;
  }

  if (browserInitializationPromise) {
    return browserInitializationPromise;
  }

  // *************** START: Launch singleton browser ***************
  browserInitializationPromise = puppeteer.launch({
    headless: 'new',
    timeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
    .then((initializedBrowser) => {
      browserInstance = initializedBrowser;

      // *************** Clear stale state if Chromium exits unexpectedly
      browserInstance.once('disconnected', () => {
        browserInstance = null;
        browserInitializationPromise = null;
      });

      console.log('PDF service initialized');

      return browserInstance;
    })
    .catch((initializationError) => {
      browserInstance = null;
      browserInitializationPromise = null;

      throw new AppError(
        'PDF_SERVICE_INITIALIZATION_FAILED',
        500,
        'Failed to initialize PDF service',
        {
          cause: initializationError.code || null,
        },
      );
    });
  // *************** END: Launch singleton browser ***************

  return browserInitializationPromise;
}

/**
 * Renders HTML content into a directly consumable PDF stream.
 *
 * @param {string} htmlContent - Compiled report card HTML.
 * @returns {Promise<Readable>} Node.js readable PDF stream.
 * @throws {AppError} 500 - PDF service is unavailable or rendering fails.
 */
async function GeneratePDFStream(htmlContent) {
  if (!browserInstance?.connected) {
    throw new AppError('PDF_SERVICE_NOT_INITIALIZED', 500, 'PDF service is not initialized');
  }

  let page = null;
  let nodePDFStream = null;

  try {
    // *************** START: Render report card ***************
    page = await browserInstance.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const puppeteerPDFStream = await page.createPDFStream({
      format: 'A4',
      printBackground: true,
    });

    nodePDFStream = createNodePDFStream(puppeteerPDFStream);
    // *************** END: Render report card ***************

    // *************** Close the page for successful, failed, and aborted stream lifecycles
    let isPageCleanupStarted = false;
    const closeRenderedPage = () => {
      if (isPageCleanupStarted) {
        return;
      }

      isPageCleanupStarted = true;
      closePageSafely(page);
    };

    nodePDFStream.once('end', closeRenderedPage);
    nodePDFStream.once('error', closeRenderedPage);
    nodePDFStream.once('close', closeRenderedPage);

    return nodePDFStream;
  } catch (generationError) {
    if (generationError instanceof AppError) {
      throw generationError;
    }

    throw new AppError('PDF_GENERATION_FAILED', 500, 'Failed to generate PDF report card', {
      cause: generationError.code || null,
    });
  } finally {
    // *************** Close immediately when rendering failed before a stream could be returned
    if (page && !nodePDFStream) {
      await closePageSafely(page);
    }
  }
}

/**
 * Closes the singleton browser during graceful application shutdown.
 *
 * @returns {Promise<void>}
 */
async function ShutdownPDFService() {
  const activeBrowser = browserInstance;

  browserInstance = null;
  browserInitializationPromise = null;

  if (activeBrowser?.connected) {
    await activeBrowser.close();
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  GeneratePDFStream,
  InitializePDFService,
  ShutdownPDFService,
};
