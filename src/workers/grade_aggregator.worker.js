/**
 * Grade aggregator worker.
 *
 * Responsibility:
 * - Receive stringified grade submission IDs from the main thread.
 * - Connect to MongoDB inside the worker isolate.
 * - Compute test, subject, and block standings.
 * - Persist computed standings through bulkWrite.
 */

// *************** IMPORT CORE ***************
const { parentPort, workerData, isMainThread } = require('worker_threads');

// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const { ConnectDatabase } = require('../core/db');
const { AppError } = require('../core/errors');
const { BlockModel, SubjectModel, TestModel } = require('../features/academic/curriculum/curriculum.model');
const { StudentGradeModel } = require('../features/academic/grading/student_grade.model');
const { AcademicStandingModel } = require('../features/academic/grading/academic_standing.model');
const { AcademicYearModel } = require('../features/academic/enrollment/academic_year.model');

// *************** GLOBAL VARIABLES ***************

// Standing labels allowed by AcademicStanding schema.
const STANDING_STATUS_BY_LABEL = {
  pass: 'Pass',
  fail: 'Fail',
  retake: 'Retake',
};

// Comparison operators allowed by the curriculum grading rule schema.
const VALID_RULE_OPERATORS = new Set(['>', '>=', '<', '<=', '==']);

// Maximum attempts for the narrow duplicate-key race between concurrent first upserts.
const MAX_BULK_WRITE_ATTEMPTS = 2;

// *************** WORKER HELPER FUNCTION ***************

/**
 * Compares a numeric value against one dynamic grading rule.
 *
 * @param {number} value - Numeric value being evaluated.
 * @param {string} operator - Dynamic rule operator.
 * @param {number} threshold - Dynamic rule threshold.
 * @returns {boolean} Whether the rule matches.
 */
function CompareRuleValue(value, operator, threshold) {
  // *************** Evaluate the operator configured on the curriculum grading rule
  switch (operator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    case '==':
      return value === threshold;
    default:
      throw new AppError('INVALID_GRADING_RULE_OPERATOR', 500, 'Invalid grading rule operator');
  }
}

/**
 * Builds a priority score for a matching rule.
 *
 * Lower-bound rules prefer the highest matching threshold, while upper-bound
 * rules prefer the lowest matching threshold. This supports ranges such as
 * ">= 5 Retake" and ">= 6 Pass" without hardcoding the numeric thresholds.
 *
 * @param {Object} rule - Matching grading rule.
 * @returns {number[]} Sortable priority tuple.
 */
function BuildRulePriority(rule) {
  // *************** Exact-match rules are the most specific when several rules match
  if (rule.operator === '==') {
    return [3, 0];
  }

  // *************** Lower-bound rules prefer the highest threshold that still matches
  if (rule.operator === '>' || rule.operator === '>=') {
    return [2, Number(rule.threshold)];
  }

  // *************** Upper-bound rules prefer the lowest threshold that still matches
  if (rule.operator === '<' || rule.operator === '<=') {
    return [1, Number(rule.threshold) * -1];
  }

  return [0, 0];
}

/**
 * Normalizes a dynamic grading rule label to the AcademicStanding enum.
 *
 * @param {string} label - Rule label from the curriculum configuration.
 * @returns {string} Academic standing enum value.
 */
function NormalizeStandingStatus(label) {
  // *************** Normalize database rule labels to the enum casing required by AcademicStanding
  const normalizedStatus = STANDING_STATUS_BY_LABEL[String(label || '').trim().toLowerCase()];

  if (!normalizedStatus) {
    throw new AppError('INVALID_GRADING_RULE_LABEL', 500, 'Invalid grading rule label');
  }

  return normalizedStatus;
}

/**
 * Validates the dynamic grading rules before a standing is computed.
 *
 * @param {Array} gradingRules - Dynamic curriculum grading rules.
 * @returns {void}
 * @throws {AppError} When rules are missing or malformed.
 */
function ValidateGradingRules(gradingRules) {
  if (!Array.isArray(gradingRules) || gradingRules.length === 0) {
    throw new AppError('GRADING_RULES_REQUIRED', 500, 'Grading rules are required');
  }

  for (const rule of gradingRules) {
    if (!rule || !VALID_RULE_OPERATORS.has(rule.operator) || typeof rule.threshold !== 'number' || !Number.isFinite(rule.threshold)) {
      throw new AppError('INVALID_GRADING_RULE', 500, 'Invalid grading rule');
    }

    NormalizeStandingStatus(rule.label);
  }
}

/**
 * Evaluates a score or average against dynamic grading rules.
 *
 * @param {number} value - Score or average to evaluate.
 * @param {Array} gradingRules - Dynamic rules from the curriculum model.
 * @returns {string} Computed standing status.
 */
function EvaluateStandingStatus(value, gradingRules) {
  ValidateGradingRules(gradingRules);

  if (!Number.isFinite(Number(value))) {
    throw new AppError('INVALID_GRADING_VALUE', 500, 'Invalid grading value');
  }

  // *************** Match the computed score against every dynamic rule from the curriculum document
  const matchingRules = gradingRules.filter((rule) => {
    return CompareRuleValue(Number(value), rule.operator, Number(rule.threshold));
  });

  if (matchingRules.length === 0) {
    throw new AppError('GRADING_RULE_MATCH_NOT_FOUND', 500, 'No grading rule matched the computed value');
  }

  // *************** Sort matching rules so overlapping dynamic ranges resolve deterministically
  matchingRules.sort((leftRule, rightRule) => {
    const leftPriority = BuildRulePriority(leftRule);
    const rightPriority = BuildRulePriority(rightRule);

    if (rightPriority[0] !== leftPriority[0]) {
      return rightPriority[0] - leftPriority[0];
    }

    return rightPriority[1] - leftPriority[1];
  });

  return NormalizeStandingStatus(matchingRules[0].label);
}

/**
 * Rounds a computed mark to two decimal places.
 *
 * @param {number} value - Raw computed value.
 * @returns {number} Rounded value.
 */
function RoundMark(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Calculates a weighted average and falls back to an arithmetic average
 * when child weightage is unavailable.
 *
 * @param {Array} items - Child items to aggregate.
 * @param {string} valueKey - Numeric value key on each child item.
 * @param {string} weightageKey - Weightage key on each child item.
 * @returns {number} Computed average.
 */
function CalculateAverage(items, valueKey, weightageKey) {
  if (!items.length) {
    return 0;
  }

  // *************** Sum configured child weightage to support weighted academic averages
  const totalWeightage = items.reduce((total, item) => {
    return total + Math.max(Number(item[weightageKey] || 0), 0);
  }, 0);

  if (totalWeightage > 0) {
    // *************** Use weightage-based calculation when curriculum weights are available
    const weightedAverage = items.reduce((total, item) => {
      return total + (Number(item[valueKey] || 0) * Math.max(Number(item[weightageKey] || 0), 0)) / totalWeightage;
    }, 0);

    return RoundMark(weightedAverage);
  }

  // *************** Fall back to arithmetic average for defensive completeness
  const arithmeticAverage = items.reduce((total, item) => total + Number(item[valueKey] || 0), 0) / items.length;

  return RoundMark(arithmeticAverage);
}

/**
 * Builds a stable score lookup key.
 *
 * @param {Object|string} studentId - Student identifier.
 * @param {Object|string} testId - Test identifier.
 * @returns {string} Lookup key.
 */
function BuildScoreLookupKey(studentId, testId) {
  return `${studentId.toString()}:${testId.toString()}`;
}

/**
 * Builds a monotonic version key from a grade document.
 *
 * @param {Object} grade - Student grade document.
 * @returns {string} Stable version key.
 */
function BuildGradeVersionKey(grade) {
  const versionDate = grade.updated_at || grade.created_at;

  if (!versionDate || Number.isNaN(new Date(versionDate).getTime()) || !grade._id) {
    throw new AppError('INVALID_GRADE_VERSION', 500, 'Invalid grade version');
  }

  return `${new Date(versionDate).toISOString()}|${grade._id.toString()}`;
}

/**
 * Builds a deterministic snapshot version from the latest grade and grade count.
 *
 * The count makes an immutable newer snapshot sort after an older snapshot even
 * when two inserts share a timestamp and the newer ObjectId sorts lower.
 *
 * @param {string} latestGradeVersionKey - Latest timestamp and grade identifier.
 * @param {number} gradeCount - Number of grades included in the student snapshot.
 * @returns {string} Monotonic aggregation snapshot key.
 */
function BuildAggregationVersionKey(latestGradeVersionKey, gradeCount) {
  if (!latestGradeVersionKey || !Number.isInteger(gradeCount) || gradeCount < 1) {
    throw new AppError('INVALID_AGGREGATION_VERSION', 500, 'Invalid aggregation version');
  }

  return `${latestGradeVersionKey}|${String(gradeCount).padStart(12, '0')}`;
}

/**
 * Validates and parses the worker payload.
 *
 * @returns {Object} Parsed worker payload.
 * @throws {AppError} When payload is invalid.
 */
function ParseWorkerPayload(serializedWorkerData = workerData) {
  // *************** Parse only the stringified ID payload required by the worker thread mandate
  let payload;

  try {
    payload = JSON.parse(serializedWorkerData);
  } catch (error) {
    throw new AppError('INVALID_GRADE_AGGREGATOR_PAYLOAD', 400, 'Invalid grade aggregator payload');
  }

  if (!Array.isArray(payload.student_ids) || !payload.student_ids.length) {
    // *************** Reject empty worker payloads before any database work begins
    throw new AppError('GRADE_AGGREGATOR_STUDENT_IDS_REQUIRED', 400, 'Student ids are required');
  }

  if (!payload.test_id) {
    throw new AppError('GRADE_AGGREGATOR_TEST_ID_REQUIRED', 400, 'Test id is required');
  }

  if (!payload.academic_year_id) {
    throw new AppError('GRADE_AGGREGATOR_ACADEMIC_YEAR_ID_REQUIRED', 400, 'Academic year id is required');
  }

  return {
    student_ids: [...new Set(payload.student_ids.map(String))],
    test_id: payload.test_id,
    academic_year_id: payload.academic_year_id,
  };
}

/**
 * Verifies that the selected curriculum block belongs to the requested
 * academic year from both sides of the relationship.
 *
 * @param {Object} block - Curriculum block document.
 * @param {string} academicYearId - Requested academic year identifier.
 * @returns {Promise<void>}
 * @throws {AppError} When the hierarchy does not belong to the selected year.
 */
async function ValidateAcademicYearHierarchy(block, academicYearId) {
  if (!block?._id || !block?.academic_year_id) {
    throw new AppError('INVALID_CURRICULUM_HIERARCHY', 500, 'Invalid curriculum hierarchy');
  }

  if (block.academic_year_id.toString() !== academicYearId.toString()) {
    throw new AppError('TEST_ACADEMIC_YEAR_MISMATCH', 400, 'Test does not belong to the selected academic year');
  }

  const academicYear = await AcademicYearModel.findOne({
    _id: academicYearId,
    block_ids: block._id,
  })
    .select('_id')
    .lean();

  if (!academicYear) {
    throw new AppError('ACADEMIC_YEAR_BLOCK_MISMATCH', 400, 'Block does not belong to the selected academic year');
  }
}
/**
 * Loads the curriculum hierarchy for the submitted test.
 *
 * @param {string} testId - Submitted test identifier.
 * @param {string} academicYearId - Requested academic year identifier.
 * @returns {Promise<Object>} Block, subject, and test hierarchy.
 * @throws {AppError} When hierarchy references are missing.
 */
async function LoadCurriculumHierarchy(testId, academicYearId) {
  // *************** Load the submitted test to discover its parent subject and block
  const submittedTest = await TestModel.findById(testId).select('_id subject_id').lean();

  if (!submittedTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  // *************** Load the parent subject that owns the submitted test
  const submittedSubject = await SubjectModel.findById(submittedTest.subject_id).select('_id block_id').lean();

  if (!submittedSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  // *************** Load the parent block that owns the submitted subject
  const block = await BlockModel.findById(submittedSubject.block_id).select('_id academic_year_id grading_rules').lean();

  if (!block) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  await ValidateAcademicYearHierarchy(block, academicYearId);

  // *************** Load every subject in the block so block standing reflects the full hierarchy
  const subjects = await SubjectModel.find({
    block_id: block._id,
  })
    .select('_id weightage grading_rules')
    .sort({ created_at: 1, _id: 1 })
    .lean();

  const subjectIds = subjects.map((subject) => subject._id);

  // *************** Load every test under the block subjects for nested standing construction
  const tests = await TestModel.find({
    subject_id: {
      $in: subjectIds,
    },
  })
    .select('_id subject_id weightage grading_rules')
    .sort({ subject_id: 1, created_at: 1, _id: 1 })
    .lean();

  return {
    block,
    subjects,
    tests,
  };
}

/**
 * Builds a score lookup map for the selected students and block tests.
 *
 * @param {string[]} studentIds - Student identifiers to aggregate.
 * @param {Object[]} tests - Curriculum tests under the block.
 * @param {string} academicYearId - Academic year identifier.
 * @returns {Promise<Map>} Score lookup map.
 */
async function BuildScoreLookup(studentIds, tests, academicYearId) {
  const testIds = tests.map((test) => test._id);

  // *************** Fetch all relevant grades in one query to avoid N+1 reads in the worker
  const grades = await StudentGradeModel.find({
    student_id: {
      $in: studentIds,
    },
    test_id: {
      $in: testIds,
    },
    academic_year_id: academicYearId,
  })
    .select('_id student_id test_id score created_at updated_at')
    .lean();

  const scoreLookup = new Map();
  const aggregationVersionByStudentId = new Map();
  const gradeCountByStudentId = new Map();

  // *************** Store scores by student/test pair for fast standing construction
  for (const grade of grades) {
    scoreLookup.set(BuildScoreLookupKey(grade.student_id, grade.test_id), Number(grade.score || 0));

    const studentId = grade.student_id.toString();
    const gradeVersionKey = BuildGradeVersionKey(grade);
    const currentVersionKey = aggregationVersionByStudentId.get(studentId);

    gradeCountByStudentId.set(studentId, (gradeCountByStudentId.get(studentId) || 0) + 1);

    if (!currentVersionKey || gradeVersionKey > currentVersionKey) {
      aggregationVersionByStudentId.set(studentId, gradeVersionKey);
    }
  }

  for (const [studentId, latestGradeVersionKey] of aggregationVersionByStudentId) {
    aggregationVersionByStudentId.set(
      studentId,
      BuildAggregationVersionKey(latestGradeVersionKey, gradeCountByStudentId.get(studentId)),
    );
  }

  return {
    scoreLookup,
    aggregationVersionByStudentId,
  };
}

/**
 * Builds an AcademicStanding bulkWrite operation for one student.
 *
 * @param {string} studentId - Student identifier.
 * @param {string} academicYearId - Academic year identifier.
 * @param {Object} hierarchy - Loaded block hierarchy.
 * @param {Map} scoreLookup - Student/test score lookup map.
 * @returns {Object} bulkWrite updateOne operation.
 */
function BuildAcademicStandingBulkOperation(studentId, academicYearId, hierarchy, scoreLookup, aggregationVersionKey) {
  if (!aggregationVersionKey) {
    throw new AppError('GRADE_AGGREGATOR_VERSION_REQUIRED', 500, 'Grade aggregation version is required');
  }

  const testsBySubjectId = new Map();

  // *************** Group tests by subject so each standing document keeps Subject -> Test nesting
  for (const test of hierarchy.tests) {
    const subjectId = test.subject_id.toString();

    if (!testsBySubjectId.has(subjectId)) {
      testsBySubjectId.set(subjectId, []);
    }

    testsBySubjectId.get(subjectId).push(test);
  }

  // *************** Build the subject snapshots and their nested test snapshots for one student
  const subjects = hierarchy.subjects.map((subject) => {
    const subjectTests = testsBySubjectId.get(subject._id.toString()) || [];
    const computedTests = subjectTests.map((test) => {
      const scoreLookupKey = BuildScoreLookupKey(studentId, test._id);
      const isGraded = scoreLookup.has(scoreLookupKey);

      // *************** Preserve full hierarchy and score unsubmitted tests as zero to avoid inflated averages
      const totalMark = isGraded ? RoundMark(scoreLookup.get(scoreLookupKey)) : 0;

      return {
        test_id: test._id,
        weightage: test.weightage,
        total_mark: totalMark,
        test_status: EvaluateStandingStatus(totalMark, test.grading_rules),
        is_graded: isGraded,
      };
    });

    const subjectAverage = CalculateAverage(computedTests, 'total_mark', 'weightage');

    return {
      subject_id: subject._id,
      weightage: subject.weightage,
      subject_average: subjectAverage,
      subject_status: EvaluateStandingStatus(subjectAverage, subject.grading_rules),
      tests: computedTests.map((test) => ({
        test_id: test.test_id,
        total_mark: test.total_mark,
        test_status: test.test_status,
        is_graded: test.is_graded,
      })),
    };
  });

  // *************** Aggregate subject averages into the block-level standing
  const blockAverage = CalculateAverage(subjects, 'subject_average', 'weightage');
  const aggregationVersionAt = new Date(aggregationVersionKey.split('|')[0]);
  const shouldApplyIncomingSnapshot = {
    $lte: [
      {
        $ifNull: ['$aggregation_version_key', ''],
      },
      aggregationVersionKey,
    ],
  };
  const standingSubjects = subjects.map((subject) => ({
    subject_id: subject.subject_id,
    subject_average: subject.subject_average,
    subject_status: subject.subject_status,
    tests: subject.tests,
  }));

  return {
    updateOne: {
      filter: {
        student_id: studentId,
        academic_year_id: academicYearId,
        block_id: hierarchy.block._id,
      },
      update: [
        {
          $set: {
            student_id: new mongoose.Types.ObjectId(studentId),
            academic_year_id: new mongoose.Types.ObjectId(academicYearId),
            block_id: hierarchy.block._id,
            aggregation_version_key: {
              $cond: [shouldApplyIncomingSnapshot, aggregationVersionKey, '$aggregation_version_key'],
            },
            aggregation_version_at: {
              $cond: [shouldApplyIncomingSnapshot, aggregationVersionAt, '$aggregation_version_at'],
            },
            block_average: {
              $cond: [shouldApplyIncomingSnapshot, blockAverage, '$block_average'],
            },
            block_status: {
              $cond: [
                shouldApplyIncomingSnapshot,
                EvaluateStandingStatus(blockAverage, hierarchy.block.grading_rules),
                '$block_status',
              ],
            },
            subjects: {
              $cond: [shouldApplyIncomingSnapshot, standingSubjects, '$subjects'],
            },
          },
        },
      ],
      upsert: true,
    },
  };
}

/**
 * Checks whether a bulk-write error contains only duplicate-key write errors.
 *
 * @param {Error} error - Mongoose or MongoDB bulk-write error.
 * @returns {boolean} Whether retrying the idempotent upserts is safe.
 */
function IsDuplicateKeyBulkWriteError(error) {
  const writeErrors = error?.writeErrors || error?.result?.getWriteErrors?.() || [];

  if (writeErrors.length > 0) {
    return writeErrors.every((writeError) => writeError.code === 11000);
  }

  return error?.code === 11000;
}

/**
 * Persists standing snapshots and retries the concurrent first-upsert race.
 *
 * A unique standing index can make two simultaneous upserts race when neither
 * worker initially sees a document. Retrying after the duplicate-key result
 * turns the losing insert into a normal version-guarded update.
 *
 * @param {Object[]} bulkOperations - Standing updateOne operations.
 * @param {Object} [standingModel=AcademicStandingModel] - Persistence model.
 * @returns {Promise<Object>} MongoDB bulk-write result.
 */
async function ExecuteAcademicStandingBulkWrite(bulkOperations, standingModel = AcademicStandingModel) {
  let attempt = 0;

  while (attempt < MAX_BULK_WRITE_ATTEMPTS) {
    try {
      return await standingModel.bulkWrite(bulkOperations, {
        ordered: false,
      });
    } catch (error) {
      attempt += 1;

      if (!IsDuplicateKeyBulkWriteError(error) || attempt >= MAX_BULK_WRITE_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new AppError('GRADE_AGGREGATOR_BULK_WRITE_FAILED', 500, 'Grade aggregation bulk write failed');
}

/**
 * Runs the grade aggregation worker process.
 *
 * @returns {Promise<void>}
 */
async function RunGradeAggregatorWorker() {
  // *************** START: Parse worker payload ***************
  const payload = ParseWorkerPayload();
  // *************** END: Parse worker payload ***************

  // *************** START: Initialize worker database context ***************
  // *************** Establish a dedicated MongoDB connection inside the worker isolate
  await ConnectDatabase({
    autoIndex: false,
  });

  // *************** END: Initialize worker database context ***************

  // *************** START: Load curriculum hierarchy and submitted grade scores ***************
  const hierarchy = await LoadCurriculumHierarchy(payload.test_id, payload.academic_year_id);
  const { scoreLookup, aggregationVersionByStudentId } = await BuildScoreLookup(
    payload.student_ids,
    hierarchy.tests,
    payload.academic_year_id,
  );
  // *************** END: Load curriculum hierarchy and submitted grade scores ***************

  // *************** START: Build one upsert operation per student standing snapshot ***************
  const bulkOperations = payload.student_ids.map((studentId) => {
    return BuildAcademicStandingBulkOperation(
      studentId,
      payload.academic_year_id,
      hierarchy,
      scoreLookup,
      aggregationVersionByStudentId.get(studentId),
    );
  });
  // *************** END: Build one upsert operation per student standing snapshot ***************

  // *************** START: Persist academic standings in bulk ***************
  if (bulkOperations.length > 0) {
    // *************** Persist all student standing snapshots in one database round-trip
    await ExecuteAcademicStandingBulkWrite(bulkOperations);
  }
  // *************** END: Persist academic standings in bulk ***************

  // *************** START: Notify parent thread of successful completion ***************
  parentPort.postMessage({
    status: 'success',
  });
  // *************** END: Notify parent thread of successful completion ***************
}

/**
 * Reports worker failures to the parent thread.
 *
 * The parent process owns error logging so the same background failure
 * is not written twice to the shared error log collection.
 *
 * @param {Error} error - Worker execution error.
 * @returns {Promise<void>}
 */
async function HandleWorkerFailure(error, port = parentPort) {
  // *************** Report failure details to the parent so the main process can persist the error log
  port.postMessage({
    status: 'error',
    code: error.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
    message: error.message || 'Grade aggregator worker failed',
  });
}

// *************** WORKER BOOTSTRAP ***************
if (!isMainThread) {
  RunGradeAggregatorWorker()
    .catch(async (error) => {
      await HandleWorkerFailure(error);
    })
    .finally(async () => {
      // *************** Close the worker-owned MongoDB connection after success or failure
      await mongoose.disconnect();
    });
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildAcademicStandingBulkOperation,
  BuildAggregationVersionKey,
  BuildGradeVersionKey,
  BuildScoreLookup,
  BuildScoreLookupKey,
  CalculateAverage,
  CompareRuleValue,
  EvaluateStandingStatus,
  ExecuteAcademicStandingBulkWrite,
  HandleWorkerFailure,
  IsDuplicateKeyBulkWriteError,
  LoadCurriculumHierarchy,
  NormalizeStandingStatus,
  ParseWorkerPayload,
  ValidateAcademicYearHierarchy,
  ValidateGradingRules,
};
