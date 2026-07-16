// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const { AppError } = require('../../../core/errors');
const { BlockModel, SubjectModel, TestModel } = require('../curriculum/curriculum.model');
const { AcademicYearModel } = require('../enrollment/academic_year.model');
const { StudentGradeModel } = require('./student_grade.model');
const { AcademicStandingModel } = require('./academic_standing.model');
const { GradeAggregationJobModel } = require('./grade_aggregation_job.model');

// *************** GLOBAL VARIABLES ***************

const STANDING_STATUS_BY_LABEL = {
  pass: 'Pass',
  fail: 'Fail',
  retake: 'Retake',
};

const PENDING_STANDING_STATUS = 'Pending';
const VALID_RULE_OPERATORS = new Set(['>', '>=', '<', '<=', '==']);
const MAX_BULK_WRITE_ATTEMPTS = 2;
const MIN_GRADE_VALUE = 0;
const MAX_GRADE_VALUE = 100;
const BASE_RETRY_BACKOFF_MS = 60 * 1000;
const MAX_RETRY_BACKOFF_MS = 15 * 60 * 1000;
const RULE_COVERAGE_PROBE_OFFSET = 0.000001;

// *************** HELPER FUNCTION ***************

function CompareRuleValue(value, operator, threshold) {
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

function BuildRulePriority(rule) {
  if (rule.operator === '==') {
    return [3, 0];
  }

  if (rule.operator === '>' || rule.operator === '>=') {
    return [2, Number(rule.threshold)];
  }

  if (rule.operator === '<' || rule.operator === '<=') {
    return [1, Number(rule.threshold) * -1];
  }

  return [0, 0];
}

function NormalizeStandingStatus(label) {
  const normalizedStatus = STANDING_STATUS_BY_LABEL[String(label || '').trim().toLowerCase()];

  if (!normalizedStatus) {
    throw new AppError('INVALID_GRADING_RULE_LABEL', 500, 'Invalid grading rule label', {
      label,
    });
  }

  return normalizedStatus;
}

function SortMatchingRules(matchingRules) {
  return matchingRules.sort((leftRule, rightRule) => {
    const leftPriority = BuildRulePriority(leftRule);
    const rightPriority = BuildRulePriority(rightRule);

    if (rightPriority[0] !== leftPriority[0]) {
      return rightPriority[0] - leftPriority[0];
    }

    return rightPriority[1] - leftPriority[1];
  });
}

function GetRuleDirection(rule) {
  if (rule.operator === '>' || rule.operator === '>=') {
    return 'lower_bound';
  }

  if (rule.operator === '<' || rule.operator === '<=') {
    return 'upper_bound';
  }

  return 'exact';
}

function ValidateRuleOverlapAtValue(gradingRules, value) {
  const matchingRules = SortMatchingRules(
    gradingRules.filter((rule) => CompareRuleValue(value, rule.operator, Number(rule.threshold))),
  );

  if (matchingRules.length < 2) {
    return;
  }

  const matchingRuleDirections = new Set(matchingRules.map(GetRuleDirection));

  if (matchingRuleDirections.size > 1 || matchingRuleDirections.has('exact')) {
    throw new AppError('GRADING_RULE_RANGES_OVERLAP', 500, 'Grading rule ranges overlap', {
      value,
    });
  }

  const firstPriority = BuildRulePriority(matchingRules[0]);
  const secondPriority = BuildRulePriority(matchingRules[1]);

  if (firstPriority[0] === secondPriority[0] && firstPriority[1] === secondPriority[1]) {
    throw new AppError('GRADING_RULE_RANGES_OVERLAP', 500, 'Grading rule ranges overlap', {
      value,
    });
  }
}

function BuildRuleCoverageProbeValues(gradingRules) {
  const thresholdValues = [
    MIN_GRADE_VALUE,
    MAX_GRADE_VALUE,
    ...gradingRules
      .map((rule) => Number(rule.threshold))
      .filter((threshold) => threshold >= MIN_GRADE_VALUE && threshold <= MAX_GRADE_VALUE),
  ];
  const sortedThresholds = [...new Set(thresholdValues)].sort((leftValue, rightValue) => leftValue - rightValue);
  const probeValues = new Set();

  for (const threshold of sortedThresholds) {
    probeValues.add(threshold);

    if (threshold > MIN_GRADE_VALUE) {
      probeValues.add(Math.max(MIN_GRADE_VALUE, threshold - RULE_COVERAGE_PROBE_OFFSET));
    }

    if (threshold < MAX_GRADE_VALUE) {
      probeValues.add(Math.min(MAX_GRADE_VALUE, threshold + RULE_COVERAGE_PROBE_OFFSET));
    }
  }

  for (let index = 0; index < sortedThresholds.length - 1; index += 1) {
    probeValues.add((sortedThresholds[index] + sortedThresholds[index + 1]) / 2);
  }

  return [...probeValues].sort((leftValue, rightValue) => leftValue - rightValue);
}

function ValidateGradingRuleCoverage(gradingRules) {
  const probeValues = BuildRuleCoverageProbeValues(gradingRules);

  for (const value of probeValues) {
    const matchingRules = gradingRules.filter((rule) => CompareRuleValue(value, rule.operator, Number(rule.threshold)));

    if (matchingRules.length === 0) {
      throw new AppError('GRADING_RULE_RANGES_INCOMPLETE', 500, 'Grading rule ranges are incomplete', {
        value,
      });
    }

    ValidateRuleOverlapAtValue(gradingRules, value);
  }
}

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

function EvaluateStandingStatus(value, gradingRules) {
  ValidateGradingRules(gradingRules);

  if (!Number.isFinite(Number(value))) {
    throw new AppError('INVALID_GRADING_VALUE', 500, 'Invalid grading value');
  }

  const matchingRules = gradingRules.filter((rule) => {
    return CompareRuleValue(Number(value), rule.operator, Number(rule.threshold));
  });

  if (matchingRules.length === 0) {
    throw new AppError('GRADING_RULE_MATCH_NOT_FOUND', 500, 'No grading rule matched the computed value', {
      value,
    });
  }

  ValidateGradingRuleCoverage(gradingRules);
  SortMatchingRules(matchingRules);

  return NormalizeStandingStatus(matchingRules[0].label);
}

function RoundMark(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function CalculateAverage(items, valueKey, weightageKey) {
  if (!items.length) {
    return 0;
  }

  const totalWeightage = items.reduce((total, item) => {
    return total + Math.max(Number(item[weightageKey] || 0), 0);
  }, 0);

  if (totalWeightage > 0) {
    const weightedAverage = items.reduce((total, item) => {
      return total + (Number(item[valueKey] || 0) * Math.max(Number(item[weightageKey] || 0), 0)) / totalWeightage;
    }, 0);

    return RoundMark(weightedAverage);
  }

  const arithmeticAverage = items.reduce((total, item) => total + Number(item[valueKey] || 0), 0) / items.length;

  return RoundMark(arithmeticAverage);
}

function BuildScoreLookupKey(studentId, testId) {
  return `${studentId.toString()}:${testId.toString()}`;
}

function BuildGradeVersionKey(grade) {
  const versionDate = grade.updated_at || grade.created_at;

  if (!versionDate || Number.isNaN(new Date(versionDate).getTime()) || !grade._id) {
    throw new AppError('INVALID_GRADE_VERSION', 500, 'Invalid grade version');
  }

  return `${new Date(versionDate).toISOString()}|${grade._id.toString()}`;
}

function BuildAggregationVersionKey(latestGradeVersionKey, gradeCount) {
  if (!latestGradeVersionKey || !Number.isInteger(gradeCount) || gradeCount < 1) {
    throw new AppError('INVALID_AGGREGATION_VERSION', 500, 'Invalid aggregation version');
  }

  return `${latestGradeVersionKey}|${String(gradeCount).padStart(12, '0')}`;
}

function BuildGradeAggregationLockKey(academicYearId, blockId) {
  return `${academicYearId.toString()}:${blockId.toString()}`;
}

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

async function LoadCurriculumHierarchy(testId, academicYearId) {
  const submittedTest = await TestModel.findById(testId).select('_id subject_id').lean();

  if (!submittedTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  const submittedSubject = await SubjectModel.findById(submittedTest.subject_id).select('_id block_id').lean();

  if (!submittedSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  const block = await BlockModel.findById(submittedSubject.block_id).select('_id academic_year_id grading_rules').lean();

  if (!block) {
    throw new AppError('BLOCK_NOT_FOUND', 404, 'Block not found');
  }

  await ValidateAcademicYearHierarchy(block, academicYearId);

  const subjects = await SubjectModel.find({
    block_id: block._id,
  })
    .select('_id weightage grading_rules')
    .sort({ created_at: 1, _id: 1 })
    .lean();

  const subjectIds = subjects.map((subject) => subject._id);

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

async function BuildScoreLookup(studentIds, tests, academicYearId) {
  const testIds = tests.map((test) => test._id);
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

function BuildAcademicStandingBulkOperation(studentId, academicYearId, hierarchy, scoreLookup, aggregationVersionKey) {
  if (!aggregationVersionKey) {
    throw new AppError('GRADE_AGGREGATOR_VERSION_REQUIRED', 500, 'Grade aggregation version is required');
  }

  const testsBySubjectId = new Map();

  for (const test of hierarchy.tests) {
    const subjectId = test.subject_id.toString();

    if (!testsBySubjectId.has(subjectId)) {
      testsBySubjectId.set(subjectId, []);
    }

    testsBySubjectId.get(subjectId).push(test);
  }

  const subjects = hierarchy.subjects.map((subject) => {
    const subjectTests = testsBySubjectId.get(subject._id.toString()) || [];
    const computedTests = subjectTests.map((test) => {
      const scoreLookupKey = BuildScoreLookupKey(studentId, test._id);
      const isGraded = scoreLookup.has(scoreLookupKey);
      const totalMark = isGraded ? RoundMark(scoreLookup.get(scoreLookupKey)) : 0;

      return {
        test_id: test._id,
        weightage: test.weightage,
        total_mark: totalMark,
        test_status: isGraded ? EvaluateStandingStatus(totalMark, test.grading_rules) : PENDING_STANDING_STATUS,
        is_graded: isGraded,
      };
    });

    const subjectAverage = CalculateAverage(computedTests, 'total_mark', 'weightage');
    const hasMissingTest = computedTests.length !== subjectTests.length || computedTests.some((test) => !test.is_graded);

    return {
      subject_id: subject._id,
      weightage: subject.weightage,
      subject_average: subjectAverage,
      subject_status:
        hasMissingTest || computedTests.length === 0
          ? PENDING_STANDING_STATUS
          : EvaluateStandingStatus(subjectAverage, subject.grading_rules),
      tests: computedTests.map((test) => ({
        test_id: test.test_id,
        total_mark: test.total_mark,
        test_status: test.test_status,
        is_graded: test.is_graded,
      })),
    };
  });

  const blockAverage = CalculateAverage(subjects, 'subject_average', 'weightage');
  const hasIncompleteSubject =
    subjects.length !== hierarchy.subjects.length ||
    subjects.length === 0 ||
    subjects.some((subject) => subject.subject_status === PENDING_STANDING_STATUS);
  const blockStatus = hasIncompleteSubject ? PENDING_STANDING_STATUS : EvaluateStandingStatus(blockAverage, hierarchy.block.grading_rules);
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
              $cond: [shouldApplyIncomingSnapshot, blockStatus, '$block_status'],
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

function IsDuplicateKeyBulkWriteError(error) {
  const writeErrors = error?.writeErrors || error?.result?.getWriteErrors?.() || [];

  if (writeErrors.length > 0) {
    return writeErrors.every((writeError) => writeError.code === 11000);
  }

  return error?.code === 11000;
}

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

function BuildRetryDelayMs(attempts) {
  const retryDelay = BASE_RETRY_BACKOFF_MS * 2 ** Math.max(Number(attempts || 1) - 1, 0);

  return Math.min(retryDelay, MAX_RETRY_BACKOFF_MS);
}

async function ClaimGradeAggregationJob(jobId, jobModel = GradeAggregationJobModel) {
  try {
    return await jobModel
      .findOneAndUpdate(
        {
          _id: jobId,
          status: {
            $in: ['queued', 'retry'],
          },
          next_run_at: {
            $lte: new Date(),
          },
        },
        {
          $set: {
            status: 'running',
            worker_started_at: new Date(),
            completed_at: null,
          },
          $inc: {
            attempts: 1,
          },
        },
        {
          new: true,
        },
      )
      .lean();
  } catch (error) {
    if (error?.code === 11000) {
      await MarkGradeAggregationJobFailed(
        jobId,
        new AppError('GRADE_AGGREGATION_JOB_LOCKED', 409, 'Grade aggregation job lock is currently held'),
        jobModel,
      );
    }

    throw error;
  }
}

async function MarkGradeAggregationJobCompleted(jobId, jobModel = GradeAggregationJobModel) {
  return jobModel.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: 'completed',
        completed_at: new Date(),
        last_error: {
          code: null,
          message: null,
        },
        last_error_at: null,
      },
    },
    {
      new: true,
    },
  );
}

async function MarkGradeAggregationJobFailed(jobId, error, jobModel = GradeAggregationJobModel) {
  const job = await jobModel.findById(jobId).select('_id attempts max_attempts').lean();

  if (!job) {
    return null;
  }

  const shouldRetry = Number(job.attempts || 0) < Number(job.max_attempts || 1);
  const nextRunAt = shouldRetry ? new Date(Date.now() + BuildRetryDelayMs(job.attempts)) : null;

  return jobModel.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: shouldRetry ? 'retry' : 'failed',
        next_run_at: nextRunAt || new Date(),
        last_error: {
          code: error.code || 'GRADE_AGGREGATOR_WORKER_FAILED',
          message: error.message || 'Grade aggregator worker failed',
        },
        last_error_at: new Date(),
      },
    },
    {
      new: true,
    },
  );
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildAcademicStandingBulkOperation,
  BuildAggregationVersionKey,
  BuildGradeAggregationLockKey,
  BuildGradeVersionKey,
  BuildRetryDelayMs,
  BuildScoreLookup,
  BuildScoreLookupKey,
  CalculateAverage,
  ClaimGradeAggregationJob,
  CompareRuleValue,
  EvaluateStandingStatus,
  ExecuteAcademicStandingBulkWrite,
  IsDuplicateKeyBulkWriteError,
  LoadCurriculumHierarchy,
  MarkGradeAggregationJobCompleted,
  MarkGradeAggregationJobFailed,
  NormalizeStandingStatus,
  PENDING_STANDING_STATUS,
  ValidateAcademicYearHierarchy,
  ValidateGradingRules,
};
