/**
 * Academic report card helper.
 *
 * Responsibility:
 * - Validate and authorize report card operations.
 * - Issue versioned immutable report card snapshots.
 * - Load official snapshots for PDF rendering.
 */

// *************** IMPORT CORE ***************
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// *************** IMPORT LIBRARY ***************
const Handlebars = require('handlebars');

// *************** IMPORT MODULE ***************
const { AppError } = require('../../../core/errors');
const { AcademicYearModel } = require('../enrollment/academic_year.model');
const { StudentModel } = require('../../users/student/student.model');
const { AcademicStandingModel } = require('./academic_standing.model');
const { ReportCardModel } = require('./report_card.model');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const {
  ReportCardRouteParamsSchema,
  ReportCardUserClaimsSchema,
  ReportCardVersionRouteParamsSchema,
} = require('./grading.validator');

// *************** GLOBAL VARIABLES ***************

// Feature-local report card template path.
const REPORT_CARD_TEMPLATE_PATH = path.resolve(__dirname, 'templates/report_card.hbs');

// Explicit template revision persisted with every immutable version.
const REPORT_CARD_TEMPLATE_VERSION = '1.0';

// Roles explicitly permitted to download an enrolled student's report card.
const REPORT_CARD_DOWNLOAD_ROLES = new Set(['admin', 'teacher']);

// Only administrators may issue or supersede an official report card.
const REPORT_CARD_ISSUANCE_ROLES = new Set(['admin']);

// Academic years must no longer accept normal grading changes before issuance.
const FINALIZABLE_ACADEMIC_YEAR_STATUSES = new Set(['completed', 'archived']);

// Shared template promise prevents repeated disk reads and compilation per request.
let reportCardTemplatePromise = null;

// *************** HELPER FUNCTION ***************

/**
 * Formats a date for deterministic display in the report card.
 *
 * @param {Date|string|null} dateValue - Date value from MongoDB.
 * @returns {string} Human-readable UTC date.
 */
function formatReportDate(dateValue) {
  if (!dateValue) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateValue));
}

/**
 * Converts shared Joi validation failures into REST-safe AppError failures.
 *
 * @param {Object} schema - Joi schema used to validate the route payload.
 * @param {Object} input - Route parameter payload.
 * @returns {Object} Sanitized route parameters.
 * @throws {AppError} 400 - Route parameters are malformed.
 */
function validateReportCardInput(schema, input) {
  try {
    return ValidateInputWithJoi(schema, input);
  } catch (error) {
    if (error?.extensions?.code === 'VALIDATION_ERROR') {
      throw new AppError('INVALID_REPORT_CARD_IDENTIFIER', 400, 'Invalid report card identifier', {
        details: error.message,
      });
    }

    throw error;
  }
}

/**
 * Validates report card route parameters before any database query.
 *
 * @param {Object} input - Route parameters.
 * @returns {Object} Sanitized route parameters.
 */
function ValidateReportCardRouteParams(input) {
  return validateReportCardInput(ReportCardRouteParamsSchema, input);
}

/**
 * Validates versioned report card route parameters before any database query.
 *
 * @param {Object} input - Versioned route parameters.
 * @returns {Object} Sanitized route parameters with a numeric version.
 */
function ValidateReportCardVersionRouteParams(input) {
  return validateReportCardInput(ReportCardVersionRouteParamsSchema, input);
}

/**
 * Ensures JWT claims contain an explicitly allowed role.
 *
 * @param {Object|undefined} user - Authenticated JWT claims.
 * @param {Set<string>} allowedRoles - Roles explicitly allowed for the operation.
 * @returns {Object} Sanitized authenticated user claims.
 * @throws {AppError} 401|403 - Authentication is absent or access is not allowed.
 */
function assertAllowedReportCardRole(user, allowedRoles) {
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
  }

  let validatedUser;

  try {
    validatedUser = ValidateInputWithJoi(ReportCardUserClaimsSchema, user);
  } catch (error) {
    throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
  }

  if (!allowedRoles.has(validatedUser.role)) {
    throw new AppError('FORBIDDEN', 403, 'Forbidden');
  }

  return validatedUser;
}

/**
 * Confirms that the requested student belongs to the selected academic year.
 *
 * @param {Object} input - Sanitized report card identifiers.
 * @returns {Promise<void>}
 * @throws {AppError} 403 - The requested resource relationship is not allowed.
 */
async function assertStudentAcademicYearAccess(input) {
  const enrolledAcademicYear = await AcademicYearModel.findOne({
    _id: input.academicYearId,
    student_ids: input.studentId,
  })
    .select('_id')
    .lean();

  if (!enrolledAcademicYear) {
    throw new AppError('FORBIDDEN', 403, 'Forbidden');
  }
}

/**
 * Applies default-deny authorization to a report card operation.
 *
 * @param {Object} input - Authorization payload.
 * @param {Set<string>} allowedRoles - Roles explicitly allowed for the operation.
 * @returns {Promise<Object>} Sanitized route parameters.
 */
async function authorizeReportCardOperation(input, allowedRoles) {
  const validatedInput = ValidateReportCardRouteParams({
    academicYearId: input.academicYearId,
    studentId: input.studentId,
  });

  assertAllowedReportCardRole(input.user, allowedRoles);
  await assertStudentAcademicYearAccess(validatedInput);

  return validatedInput;
}

/**
 * Allows explicit download roles to access an enrolled student's report card.
 *
 * @param {Object} input - Authorization payload.
 * @returns {Promise<Object>} Sanitized route parameters.
 */
async function ValidateReportCardAccess(input) {
  return authorizeReportCardOperation(input, REPORT_CARD_DOWNLOAD_ROLES);
}

/**
 * Allows only an administrator to issue or reissue an enrolled student's report card.
 *
 * @param {Object} input - Authorization payload.
 * @returns {Promise<Object>} Sanitized route parameters.
 */
async function ValidateReportCardIssuanceAccess(input) {
  return authorizeReportCardOperation(input, REPORT_CARD_ISSUANCE_ROLES);
}

/**
 * Builds a safe version-specific PDF attachment file name.
 *
 * @param {Object} student - Student snapshot.
 * @param {Object} academicYear - Academic year snapshot.
 * @param {number} version - Official report card version.
 * @returns {string} Safe attachment filename.
 */
function buildReportCardFileName(student, academicYear, version) {
  const studentNumber = String(student.student_number || student._id || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const academicYearName = String(academicYear.name || 'academic_year').replace(/[^a-zA-Z0-9_-]/g, '_');

  return `ReportCard_${studentNumber}_${academicYearName}_v${version}.pdf`;
}

/**
 * Calculates the integrity digest for persisted immutable HTML.
 *
 * @param {string} htmlContent - Fully rendered report card HTML.
 * @returns {string} Lowercase SHA-256 hexadecimal digest.
 */
function createReportCardContentHash(htmlContent) {
  return crypto.createHash('sha256').update(htmlContent, 'utf8').digest('hex');
}

/**
 * Rejects a persisted report card whose HTML no longer matches its integrity hash.
 *
 * @param {Object} reportCard - Persisted report card projection.
 * @returns {void}
 * @throws {AppError} 500 - The immutable snapshot failed verification.
 */
function assertReportCardIntegrity(reportCard) {
  const calculatedHash = createReportCardContentHash(reportCard.html_content);

  if (calculatedHash !== reportCard.content_hash) {
    throw new AppError('REPORT_CARD_INTEGRITY_CHECK_FAILED', 500, 'Report card integrity check failed');
  }
}

/**
 * Throws when standing records are absent or still contain ungraded tests.
 *
 * @param {Object[]} academicStandings - Academic standing records.
 * @returns {void}
 * @throws {AppError} 404|409 - Official standing data is absent or incomplete.
 */
function assertAcademicStandingsFinal(academicStandings) {
  if (!academicStandings.length) {
    throw new AppError('ACADEMIC_STANDING_NOT_FOUND', 404, 'Academic standing not found');
  }

  const containsUngradedTest = academicStandings.some((standing) => {
    return standing.subjects.some((subject) => subject.tests.some((test) => !test.is_graded));
  });

  if (containsUngradedTest) {
    throw new AppError('ACADEMIC_STANDING_NOT_FINAL', 409, 'Academic standing is not final');
  }
}

/**
 * Converts populated academic standing documents into template-safe report data.
 *
 * @param {Object[]} academicStandings - Populated standing snapshots.
 * @returns {Object[]} Block, subject, and test report rows.
 */
function mapAcademicStandingsForReportCard(academicStandings) {
  return academicStandings.map((standing) => ({
    block_name: standing.block_id?.name || 'Unavailable block',
    block_average: Number(standing.block_average).toFixed(2),
    block_status: standing.block_status,
    subjects: standing.subjects.map((subject) => ({
      subject_name: subject.subject_id?.name || 'Unavailable subject',
      subject_average: Number(subject.subject_average).toFixed(2),
      subject_status: subject.subject_status,
      tests: subject.tests.map((test) => ({
        test_name: test.test_id?.name || 'Unavailable test',
        total_mark: Number(test.total_mark).toFixed(2),
        test_status: test.test_status,
      })),
    })),
  }));
}

/**
 * Loads projected database records needed to create one official snapshot.
 *
 * @param {string} academicYearId - Validated academic year identifier.
 * @param {string} studentId - Validated student identifier.
 * @returns {Promise<Object>} Student, academic year, and standing records.
 * @throws {AppError} 404|409 - Required or finalizable data was not found.
 */
async function getReportCardData(academicYearId, studentId) {
  // *************** START: Load projected report card source data ***************
  const [student, academicYear, academicStandings] = await Promise.all([
    StudentModel.findById(studentId).select('_id first_name last_name email student_number').lean(),
    AcademicYearModel.findById(academicYearId).select('_id name start_date end_date status').lean(),
    AcademicStandingModel.find({
      student_id: studentId,
      academic_year_id: academicYearId,
    })
      .select(
        '_id block_id block_average block_status subjects.subject_id subjects.subject_average '
          + 'subjects.subject_status subjects.tests.test_id subjects.tests.total_mark '
          + 'subjects.tests.test_status subjects.tests.is_graded',
      )
      .populate({ path: 'block_id', select: 'name' })
      .populate({ path: 'subjects.subject_id', select: 'name' })
      .populate({ path: 'subjects.tests.test_id', select: 'name' })
      .sort({ created_at: 1, _id: 1 })
      .lean(),
  ]);
  // *************** END: Load projected report card source data ***************

  if (!student) {
    throw new AppError('STUDENT_NOT_FOUND', 404, 'Student not found');
  }

  if (!academicYear) {
    throw new AppError('ACADEMIC_YEAR_NOT_FOUND', 404, 'Academic year not found');
  }

  if (!FINALIZABLE_ACADEMIC_YEAR_STATUSES.has(academicYear.status)) {
    throw new AppError('ACADEMIC_YEAR_NOT_FINAL', 409, 'Academic year is not final');
  }

  assertAcademicStandingsFinal(academicStandings);

  return {
    student,
    academicYear,
    academicStandings,
  };
}

/**
 * Builds template payload for one official report card version.
 *
 * @param {Object} reportCardData - Projected report card source records.
 * @param {Date} finalizedAt - Official finalization timestamp.
 * @param {number} version - Official report card version.
 * @returns {Object} Template-safe immutable snapshot payload.
 */
function buildReportCardTemplatePayload(reportCardData, finalizedAt, version) {
  return {
    student: {
      first_name: reportCardData.student.first_name,
      last_name: reportCardData.student.last_name,
      email: reportCardData.student.email,
      student_number: reportCardData.student.student_number,
    },
    academic_year: {
      name: reportCardData.academicYear.name,
      start_date: formatReportDate(reportCardData.academicYear.start_date),
      end_date: formatReportDate(reportCardData.academicYear.end_date),
    },
    report_card: {
      status: 'Final',
      version,
      finalized_at: formatReportDate(finalizedAt),
    },
    issued_at: formatReportDate(finalizedAt),
    standings: mapAcademicStandingsForReportCard(reportCardData.academicStandings),
  };
}

/**
 * Loads and compiles the report card template once for the process lifetime.
 *
 * @returns {Promise<Function>} Compiled Handlebars report card template.
 */
async function loadReportCardTemplate() {
  if (!reportCardTemplatePromise) {
    reportCardTemplatePromise = fs.promises
      .readFile(REPORT_CARD_TEMPLATE_PATH, 'utf8')
      .then((templateSource) => Handlebars.compile(templateSource))
      .catch((templateError) => {
        reportCardTemplatePromise = null;
        throw templateError;
      });
  }

  return reportCardTemplatePromise;
}

/**
 * Creates the immutable persistence payload for one report card version.
 *
 * @param {Object} input - Snapshot creation data.
 * @param {Object} input.reportCardData - Projected source records.
 * @param {Object} input.user - Authenticated administrator claims.
 * @param {number} input.version - New report card version.
 * @param {Object|null} input.supersededReportCard - Previous final version.
 * @returns {Promise<Object>} Immutable model payload.
 */
async function buildReportCardSnapshot(input) {
  const finalizedAt = new Date();
  const compileReportCard = await loadReportCardTemplate();
  const templatePayload = buildReportCardTemplatePayload(input.reportCardData, finalizedAt, input.version);
  const htmlContent = compileReportCard(templatePayload);

  return {
    student_id: input.reportCardData.student._id,
    academic_year_id: input.reportCardData.academicYear._id,
    version: input.version,
    status: 'final',
    finalized_at: finalizedAt,
    finalized_by: input.user.userId,
    supersedes_report_card_id: input.supersededReportCard?._id || null,
    source_standing_ids: input.reportCardData.academicStandings.map((standing) => standing._id),
    snapshot_data: templatePayload,
    file_name: buildReportCardFileName(
      input.reportCardData.student,
      input.reportCardData.academicYear,
      input.version,
    ),
    html_content: htmlContent,
    content_hash: createReportCardContentHash(htmlContent),
    template_version: REPORT_CARD_TEMPLATE_VERSION,
  };
}

/**
 * Normalizes concurrent issuance conflicts into a predictable AppError.
 *
 * @param {Error} error - Original persistence error.
 * @returns {void}
 * @throws {AppError|Error} Normalized operational or original unexpected error.
 */
function throwReportCardPersistenceError(error) {
  if (error instanceof AppError) {
    throw error;
  }

  if (error?.code === 11000 || error?.hasErrorLabel?.('TransientTransactionError')) {
    throw new AppError('REPORT_CARD_VERSION_CONFLICT', 409, 'Report card version conflict');
  }

  throw error;
}

/**
 * Converts a persisted report card into a safe issuance response.
 *
 * @param {Object} reportCard - Persisted report card document or plain object.
 * @returns {Object} Public issuance metadata.
 */
function mapReportCardIssuanceResult(reportCard) {
  const reportCardObject = typeof reportCard.toObject === 'function' ? reportCard.toObject() : reportCard;

  return {
    report_card_id: reportCardObject._id,
    version: reportCardObject.version,
    status: reportCardObject.status,
    finalized_at: reportCardObject.finalized_at,
    content_hash: reportCardObject.content_hash,
  };
}

/**
 * Finds a persisted report card using an explicit projection.
 *
 * @param {Object} filter - Validated report card query filter.
 * @returns {Promise<Object|null>} Projected immutable report card.
 */
async function findReportCardForDownload(filter) {
  return ReportCardModel.findOne(filter)
    .select('_id version status file_name html_content content_hash finalized_at')
    .sort({ version: -1 })
    .lean();
}

// *************** REPORT CARD HELPER FUNCTION ***************

/**
 * Aligns report card indexes with the versioned immutable model definition.
 *
 * @returns {Promise<void>}
 */
async function InitializeReportCardIndexes() {
  await ReportCardModel.init();
}

/**
 * Issues the first official immutable report card version.
 *
 * @param {Object} input - Validated identifiers and administrator claims.
 * @returns {Promise<Object>} Safe issuance metadata.
 * @throws {AppError} 409 - A report card has already been issued.
 */
async function IssueReportCard(input) {
  const validatedInput = ValidateReportCardRouteParams(input);
  const validatedUser = assertAllowedReportCardRole(input.user, REPORT_CARD_ISSUANCE_ROLES);

  await assertStudentAcademicYearAccess(validatedInput);

  const existingReportCard = await ReportCardModel.findOne({
    student_id: validatedInput.studentId,
    academic_year_id: validatedInput.academicYearId,
  })
    .select('_id version status')
    .sort({ version: -1 })
    .lean();

  if (existingReportCard) {
    throw new AppError('REPORT_CARD_ALREADY_ISSUED', 409, 'Report card already issued');
  }

  const reportCardData = await getReportCardData(validatedInput.academicYearId, validatedInput.studentId);
  const reportCardSnapshot = await buildReportCardSnapshot({
    reportCardData,
    user: validatedUser,
    version: 1,
    supersededReportCard: null,
  });

  try {
    const reportCard = await ReportCardModel.create(reportCardSnapshot);

    return mapReportCardIssuanceResult(reportCard);
  } catch (error) {
    throwReportCardPersistenceError(error);
  }
}

/**
 * Supersedes the current final report card and issues a corrected version atomically.
 *
 * @param {Object} input - Validated identifiers and administrator claims.
 * @returns {Promise<Object>} Safe issuance metadata for the new final version.
 * @throws {AppError} 404|409 - No current report exists or concurrent issuance occurred.
 */
async function ReissueReportCard(input) {
  const validatedInput = ValidateReportCardRouteParams(input);
  const validatedUser = assertAllowedReportCardRole(input.user, REPORT_CARD_ISSUANCE_ROLES);

  await assertStudentAcademicYearAccess(validatedInput);

  const reportCardData = await getReportCardData(validatedInput.academicYearId, validatedInput.studentId);
  const currentReportCard = await ReportCardModel.findOne({
    student_id: validatedInput.studentId,
    academic_year_id: validatedInput.academicYearId,
    status: 'final',
  })
    .select('_id version status')
    .sort({ version: -1 })
    .lean();

  if (!currentReportCard) {
    throw new AppError('REPORT_CARD_NOT_FOUND', 404, 'Report card not found');
  }

  const reportCardSnapshot = await buildReportCardSnapshot({
    reportCardData,
    user: validatedUser,
    version: currentReportCard.version + 1,
    supersededReportCard: currentReportCard,
  });
  let previousFinalWasSuperseded = false;

  try {
    // *************** START: Supersede the previous final version before inserting the replacement ***************
    const supersedeResult = await ReportCardModel.updateOne(
      {
        _id: currentReportCard._id,
        status: 'final',
        version: currentReportCard.version,
      },
      {
        $set: {
          status: 'superseded',
        },
      },
    );

    if (supersedeResult.matchedCount !== 1) {
      throw new AppError('REPORT_CARD_VERSION_CONFLICT', 409, 'Report card version conflict');
    }

    previousFinalWasSuperseded = true;
    // *************** END: Supersede the previous final version before inserting the replacement ***************

    const issuedReportCard = await ReportCardModel.create(reportCardSnapshot);

    return mapReportCardIssuanceResult(issuedReportCard);
  } catch (error) {
    // *************** Restore the previous final marker if the replacement insert fails on standalone MongoDB
    if (previousFinalWasSuperseded) {
      await ReportCardModel.updateOne(
        {
          _id: currentReportCard._id,
          status: 'superseded',
        },
        {
          $set: {
            status: 'final',
          },
        },
      ).catch((rollbackError) => {
        console.error(`Failed to restore report card final status: ${rollbackError.message}`);
      });
    }

    throwReportCardPersistenceError(error);
  }
}

/**
 * Loads the current final immutable report card HTML for PDF download.
 *
 * @param {Object} input - Validated route identifiers.
 * @returns {Promise<Object>} Compiled HTML snapshot and attachment filename.
 */
async function GenerateReportCardHtml(input) {
  const validatedInput = ValidateReportCardRouteParams(input);

  let reportCard = await findReportCardForDownload({
    student_id: validatedInput.studentId,
    academic_year_id: validatedInput.academicYearId,
    status: 'final',
  });

  if (!reportCard) {
    const validatedUser = assertAllowedReportCardRole(
      input.user,
      REPORT_CARD_DOWNLOAD_ROLES,
    );

    const reportCardData = await getReportCardData(
      validatedInput.academicYearId,
      validatedInput.studentId,
    );

    const snapshot = await buildReportCardSnapshot({
      reportCardData,
      user: validatedUser,
      version: 1,
      supersededReportCard: null,
    });

    try {
      reportCard = await ReportCardModel.create(snapshot);
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      reportCard = await findReportCardForDownload({
        student_id: validatedInput.studentId,
        academic_year_id: validatedInput.academicYearId,
        status: 'final',
      });
    }
  }

  assertReportCardIntegrity(reportCard);

  return {
    htmlContent: reportCard.html_content,
    fileName: reportCard.file_name,
  };
}

/**
 * Loads one immutable historical report card version for PDF download.
 *
 * @param {Object} input - Validated versioned route identifiers.
 * @returns {Promise<Object>} Historical HTML snapshot and attachment filename.
 */
async function GenerateReportCardVersionHtml(input) {
  const validatedInput = ValidateReportCardVersionRouteParams(input);
  const reportCard = await findReportCardForDownload({
    student_id: validatedInput.studentId,
    academic_year_id: validatedInput.academicYearId,
    version: validatedInput.version,
  });

  if (!reportCard) {
    throw new AppError('REPORT_CARD_NOT_FOUND', 404, 'Report card not found');
  }

  assertReportCardIntegrity(reportCard);

  return {
    htmlContent: reportCard.html_content,
    fileName: reportCard.file_name,
  };
}

// *************** EXPORT MODULE ***************
module.exports = {
  GenerateReportCardHtml,
  GenerateReportCardVersionHtml,
  InitializeReportCardIndexes,
  IssueReportCard,
  ReissueReportCard,
  ValidateReportCardAccess,
  ValidateReportCardIssuanceAccess,
  ValidateReportCardRouteParams,
  ValidateReportCardVersionRouteParams,
};
