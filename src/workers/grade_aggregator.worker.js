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
const { parentPort, workerData } = require('worker_threads');

// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const { ConnectDatabase } = require('../core/db');
const { AppError } = require('../core/errors');
const { BlockModel, SubjectModel, TestModel } = require('../features/academic/curriculum/curriculum.model');
const { StudentGradeModel } = require('../features/academic/grading/student_grade.model');
const { AcademicStandingModel } = require('../features/academic/grading/academic_standing.model');

// *************** GLOBAL VARIABLES ***************

// Standing labels allowed by AcademicStanding schema.
const STANDING_STATUS_BY_LABEL = {
  pass: 'Pass',
  fail: 'Fail',
  retake: 'Retake',
};

// Fallback standing when no dynamic grading rule matches the computed value.
const DEFAULT_STANDING_STATUS = 'Fail';

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
      return false;
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
  return STANDING_STATUS_BY_LABEL[String(label || '').trim().toLowerCase()] || DEFAULT_STANDING_STATUS;
}

/**
 * Evaluates a score or average against dynamic grading rules.
 *
 * @param {number} value - Score or average to evaluate.
 * @param {Array} gradingRules - Dynamic rules from the curriculum model.
 * @returns {string} Computed standing status.
 */
function EvaluateStandingStatus(value, gradingRules) {
  // *************** Match the computed score against every dynamic rule from the curriculum document
  const matchingRules = (gradingRules || []).filter((rule) => {
    return CompareRuleValue(Number(value), rule.operator, Number(rule.threshold));
  });

  if (matchingRules.length === 0) {
    return DEFAULT_STANDING_STATUS;
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
 * Validates and parses the worker payload.
 *
 * @returns {Object} Parsed worker payload.
 * @throws {AppError} When payload is invalid.
 */
function ParseWorkerPayload() {
  // *************** Parse only the stringified ID payload required by the worker thread mandate
  const payload = JSON.parse(workerData);

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
 * Loads the curriculum hierarchy for the submitted test.
 *
 * @param {string} testId - Submitted test identifier.
 * @returns {Promise<Object>} Block, subject, and test hierarchy.
 * @throws {AppError} When hierarchy references are missing.
 */
async function LoadCurriculumHierarchy(testId) {
  // *************** Load the submitted test to discover its parent subject and block
  const submittedTest = await TestModel.findById(testId).lean();

  if (!submittedTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  // *************** Load the parent subject that owns the submitted test
  const submittedSubject = await SubjectModel.findById(submittedTest.subject_id).lean();

  if (!submittedSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  // *************** Load the parent block that owns the submitted subject
  const block = await BlockModel.findById(submittedSubject.block_id).lean();

  if (!block) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  // *************** Load every subject in the block so block standing reflects the full hierarchy
  const subjects = await SubjectModel.find({
    block_id: block._id,
  })
    .sort({ created_at: 1, _id: 1 })
    .lean();

  const subjectIds = subjects.map((subject) => subject._id);

  // *************** Load every test under the block subjects for nested standing construction
  const tests = await TestModel.find({
    subject_id: {
      $in: subjectIds,
    },
  })
    .sort({ created_at: 1, _id: 1 })
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
    .select('student_id test_id score')
    .lean();

  const scoreLookup = new Map();

  // *************** Store scores by student/test pair for fast standing construction
  for (const grade of grades) {
    scoreLookup.set(BuildScoreLookupKey(grade.student_id, grade.test_id), Number(grade.score || 0));
  }

  return scoreLookup;
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
function BuildAcademicStandingBulkOperation(studentId, academicYearId, hierarchy, scoreLookup) {
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

  return {
    updateOne: {
      filter: {
        student_id: studentId,
        academic_year_id: academicYearId,
        block_id: hierarchy.block._id,
      },
      update: {
        $set: {
          student_id: studentId,
          academic_year_id: academicYearId,
          block_id: hierarchy.block._id,
          block_average: blockAverage,
          block_status: EvaluateStandingStatus(blockAverage, hierarchy.block.grading_rules),
          subjects: subjects.map((subject) => ({
            subject_id: subject.subject_id,
            subject_average: subject.subject_average,
            subject_status: subject.subject_status,
            tests: subject.tests,
          })),
        },
      },
      upsert: true,
    },
  };
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
  await ConnectDatabase();

  // *************** Ensure AcademicStanding indexes exist before running upsert bulk operations
  await AcademicStandingModel.init();
  // *************** END: Initialize worker database context ***************

  // *************** START: Load curriculum hierarchy and submitted grade scores ***************
  const hierarchy = await LoadCurriculumHierarchy(payload.test_id);
  const scoreLookup = await BuildScoreLookup(payload.student_ids, hierarchy.tests, payload.academic_year_id);
  // *************** END: Load curriculum hierarchy and submitted grade scores ***************

  // *************** START: Build one upsert operation per student standing snapshot ***************
  const bulkOperations = payload.student_ids.map((studentId) => {
    return BuildAcademicStandingBulkOperation(studentId, payload.academic_year_id, hierarchy, scoreLookup);
  });
  // *************** END: Build one upsert operation per student standing snapshot ***************

  // *************** START: Persist academic standings in bulk ***************
  if (bulkOperations.length > 0) {
    // *************** Persist all student standing snapshots in one database round-trip
    await AcademicStandingModel.bulkWrite(bulkOperations, {
      ordered: false,
    });
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
async function HandleWorkerFailure(error) {
  // *************** Report failure details to the parent so the main process can persist the error log
  parentPort.postMessage({
    status: 'error',
    code: error.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
    message: error.message || 'Grade aggregator worker failed',
  });
}

// *************** WORKER BOOTSTRAP ***************
RunGradeAggregatorWorker()
  .catch(async (error) => {
    await HandleWorkerFailure(error);
  })
  .finally(async () => {
    // *************** Close the worker-owned MongoDB connection after success or failure
    await mongoose.disconnect();
  });
