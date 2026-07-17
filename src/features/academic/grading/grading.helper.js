/**
 * Grading business logic layer.
 *
 * Responsibility:
 * - Validate bulk test grade submissions.
 * - Preserve Day 6 all-or-nothing insert behavior.
 * - Spawn the Day 8 academic standing worker after grades are inserted.
 * - Keep the GraphQL response non-blocking while the worker aggregates standings.
 */

// *************** IMPORT MODULE ***************
const { AppError } = require('../../../core/errors');
const { BlockModel, SubjectModel, TestModel } = require('../curriculum/curriculum.model');
const { AcademicYearModel } = require('../enrollment/academic_year.model');
const { StudentModel } = require('../../users/student/student.model');
const { StudentGradeModel } = require('./student_grade.model');
const { AcademicStandingModel } = require('./academic_standing.model');
const { SpawnGradeAggregatorWorker } = require('../../../workers/grade_aggregator.helper');

// *************** IMPORT VALIDATOR ***************
const { ValidateInputWithJoi } = require('../../../shared/validators/validator');
const { SubmitTestGradesSchema } = require('./grading.validator');

// *************** GLOBAL VARIABLES ***************

// Dynamic grading rule labels supported by the AcademicStanding schema.
const STANDING_STATUS_BY_LABEL = {
  pass: 'Pass',
  fail: 'Fail',
  retake: 'Retake',
};

// Operators supported by curriculum grading rules.
const SUPPORTED_GRADING_RULE_OPERATORS = ['>', '>=', '<', '<=', '=='];

// Grade aggregation evaluates submitted scores and averages on the institutional 0-100 scale.
const MINIMUM_GRADING_RULE_VALUE = 0;
const MAXIMUM_GRADING_RULE_VALUE = 100;

// *************** HELPER FUNCTION ***************

/**
 * Compares a numeric value against one dynamic grading rule.
 *
 * @param {number} value - Numeric value being evaluated.
 * @param {string} operator - Dynamic rule operator.
 * @param {number} threshold - Dynamic rule threshold.
 * @returns {boolean} Whether the rule matches.
 */
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
      return false;
  }
}

/**
 * Builds a priority score for a matching rule.
 *
 * Lower-bound rules intentionally form a threshold chain. For example,
 * ">= 5 Retake" and ">= 6 Pass" means values from 5 to below 6 are Retake,
 * while values 6 and above are Pass.
 *
 * @param {Object} rule - Matching grading rule.
 * @returns {number[]} Sortable priority tuple.
 */
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

/**
 * Normalizes a dynamic grading rule label to AcademicStanding enum casing.
 *
 * @param {string} label - Rule label from curriculum configuration.
 * @param {Object} context - Curriculum context for error metadata.
 * @returns {string} Academic standing enum value.
 * @throws {AppError} When the label is unsupported.
 */
function NormalizeStandingStatus(label, context = {}) {
  const normalizedStatus = STANDING_STATUS_BY_LABEL[String(label || '').trim().toLowerCase()];

  if (!normalizedStatus) {
    throw new AppError('GRADING_RULE_STATUS_UNSUPPORTED', 500, 'Unsupported grading rule status label', {
      ...context,
      label,
    });
  }

  return normalizedStatus;
}

/**
 * Throws a structured grading rule configuration error.
 *
 * @param {string} code - Stable error code.
 * @param {string} message - Error message.
 * @param {Object} context - Error metadata.
 * @returns {never}
 */
function ThrowGradingRuleConfigurationError(code, message, context) {
  throw new AppError(code, 500, message, context);
}

/**
 * Validates the low boundary between upper-bound and lower-bound rule groups.
 *
 * @param {Object|null} upperRule - Rule covering values below the first threshold.
 * @param {Object|null} firstLowerRule - First lower-bound rule.
 * @param {Set<string>} exactThresholdSet - Exact thresholds configured with ==.
 * @param {Object} context - Curriculum context for error metadata.
 * @returns {void}
 */
function ValidateGradingRuleBoundary(upperRule, firstLowerRule, exactThresholdSet, context) {
  if (!upperRule || !firstLowerRule) {
    ThrowGradingRuleConfigurationError(
      'GRADING_RULE_RANGE_INCOMPLETE',
      'Grading rule ranges must cover the full 0-100 score range',
      context,
    );
  }

  const upperThreshold = Number(upperRule.threshold);
  const lowerThreshold = Number(firstLowerRule.threshold);

  if (upperThreshold > lowerThreshold) {
    ThrowGradingRuleConfigurationError(
      'GRADING_RULE_RANGE_OVERLAP',
      'Grading rule ranges overlap',
      {
        ...context,
        upper_rule: upperRule,
        lower_rule: firstLowerRule,
      },
    );
  }

  if (upperThreshold < lowerThreshold) {
    ThrowGradingRuleConfigurationError(
      'GRADING_RULE_RANGE_INCOMPLETE',
      'Grading rule ranges leave an uncovered score range',
      {
        ...context,
        upper_rule: upperRule,
        lower_rule: firstLowerRule,
      },
    );
  }

  const upperIncludesBoundary = upperRule.operator === '<=';
  const lowerIncludesBoundary = firstLowerRule.operator === '>=';

  if (upperIncludesBoundary && lowerIncludesBoundary) {
    ThrowGradingRuleConfigurationError(
      'GRADING_RULE_RANGE_OVERLAP',
      'Grading rule ranges overlap at the boundary threshold',
      {
        ...context,
        upper_rule: upperRule,
        lower_rule: firstLowerRule,
      },
    );
  }

  if (!upperIncludesBoundary && !lowerIncludesBoundary && !exactThresholdSet.has(String(upperThreshold))) {
    ThrowGradingRuleConfigurationError(
      'GRADING_RULE_RANGE_INCOMPLETE',
      'Grading rule ranges leave the boundary threshold uncovered',
      {
        ...context,
        boundary_threshold: upperThreshold,
      },
    );
  }
}

/**
 * Validates a curriculum grading rule set before any standing is computed.
 *
 * Empty rules, unsupported labels, duplicate thresholds, obvious overlaps,
 * and incomplete 0-100 coverage are treated as configuration errors instead
 * of silently failing students.
 *
 * @param {Array} gradingRules - Dynamic grading rules from curriculum.
 * @param {Object} context - Curriculum context for error metadata.
 * @returns {void}
 * @throws {AppError} When rules are misconfigured.
 */
function ValidateGradingRulesConfiguration(gradingRules, context = {}) {
  if (!Array.isArray(gradingRules) || gradingRules.length === 0) {
    ThrowGradingRuleConfigurationError('GRADING_RULES_EMPTY', 'Grading rules must not be empty', context);
  }

  const upperBoundRules = [];
  const lowerBoundRules = [];
  const exactRules = [];
  const exactThresholdSet = new Set();
  const ruleKeySet = new Set();

  for (const rule of gradingRules) {
    const threshold = Number(rule.threshold);

    if (!SUPPORTED_GRADING_RULE_OPERATORS.includes(rule.operator) || !Number.isFinite(threshold)) {
      ThrowGradingRuleConfigurationError('GRADING_RULE_INVALID', 'Grading rule operator or threshold is invalid', {
        ...context,
        rule,
      });
    }

    if (threshold < MINIMUM_GRADING_RULE_VALUE || threshold > MAXIMUM_GRADING_RULE_VALUE) {
      ThrowGradingRuleConfigurationError(
        'GRADING_RULE_THRESHOLD_OUT_OF_RANGE',
        'Grading rule threshold must be within the 0-100 score range',
        {
          ...context,
          rule,
        },
      );
    }

    NormalizeStandingStatus(rule.label, {
      ...context,
      rule,
    });

    const ruleKey = `${rule.operator}:${threshold}`;

    if (ruleKeySet.has(ruleKey)) {
      ThrowGradingRuleConfigurationError('GRADING_RULE_RANGE_OVERLAP', 'Duplicate grading rule range found', {
        ...context,
        rule,
      });
    }

    ruleKeySet.add(ruleKey);

    if (rule.operator === '<' || rule.operator === '<=') {
      upperBoundRules.push(rule);
    } else if (rule.operator === '>' || rule.operator === '>=') {
      lowerBoundRules.push(rule);
    } else {
      exactRules.push(rule);
      exactThresholdSet.add(String(threshold));
    }
  }

  if (upperBoundRules.length > 1) {
    ThrowGradingRuleConfigurationError(
      'GRADING_RULE_RANGE_OVERLAP',
      'Multiple upper-bound grading rules create overlapping score ranges',
      {
        ...context,
        rules: upperBoundRules,
      },
    );
  }

  lowerBoundRules.sort((leftRule, rightRule) => Number(leftRule.threshold) - Number(rightRule.threshold));

  for (let ruleIndex = 1; ruleIndex < lowerBoundRules.length; ruleIndex += 1) {
    if (Number(lowerBoundRules[ruleIndex - 1].threshold) === Number(lowerBoundRules[ruleIndex].threshold)) {
      ThrowGradingRuleConfigurationError(
        'GRADING_RULE_RANGE_OVERLAP',
        'Lower-bound grading rules overlap at the same threshold',
        {
          ...context,
          previous_rule: lowerBoundRules[ruleIndex - 1],
          current_rule: lowerBoundRules[ruleIndex],
        },
      );
    }
  }

  for (const exactRule of exactRules) {
    const exactThreshold = Number(exactRule.threshold);
    const exactOverlapsUpper = upperBoundRules.some((rule) => CompareRuleValue(exactThreshold, rule.operator, rule.threshold));
    const exactOverlapsLower = lowerBoundRules.some((rule) => CompareRuleValue(exactThreshold, rule.operator, rule.threshold));

    if (exactOverlapsUpper || exactOverlapsLower) {
      ThrowGradingRuleConfigurationError(
        'GRADING_RULE_RANGE_OVERLAP',
        'Exact grading rule overlaps another score range',
        {
          ...context,
          exact_rule: exactRule,
        },
      );
    }
  }

  ValidateGradingRuleBoundary(upperBoundRules[0] || null, lowerBoundRules[0] || null, exactThresholdSet, context);
}

/**
 * Validates every grading rule set used by one loaded block hierarchy.
 *
 * @param {Object} hierarchy - Loaded block, subject, and test hierarchy.
 * @returns {void}
 */
function ValidateGradingHierarchyConfiguration(hierarchy) {
  ValidateGradingRulesConfiguration(hierarchy.block?.grading_rules, {
    level: 'block',
    block_id: hierarchy.block?._id?.toString(),
  });

  for (const subject of hierarchy.subjects || []) {
    ValidateGradingRulesConfiguration(subject.grading_rules, {
      level: 'subject',
      subject_id: subject._id?.toString(),
    });
  }

  for (const test of hierarchy.tests || []) {
    ValidateGradingRulesConfiguration(test.grading_rules, {
      level: 'test',
      test_id: test._id?.toString(),
    });
  }
}

/**
 * Evaluates a score or average against dynamic grading rules.
 *
 * @param {number} value - Score or average to evaluate.
 * @param {Array} gradingRules - Dynamic grading rules from curriculum.
 * @param {Object} context - Curriculum context for error metadata.
 * @param {Object} options - Evaluation options.
 * @returns {string} Computed standing status.
 */
function EvaluateStandingStatus(value, gradingRules, context = {}, options = {}) {
  if (!options.skipRuleValidation) {
    ValidateGradingRulesConfiguration(gradingRules, context);
  }

  const numericValue = Number(value);
  const matchingRules = gradingRules.filter((rule) => {
    return CompareRuleValue(numericValue, rule.operator, Number(rule.threshold));
  });

  if (matchingRules.length === 0) {
    throw new AppError('GRADING_RULE_NO_MATCH', 500, 'No grading rule matches the computed value', {
      ...context,
      value: numericValue,
    });
  }

  matchingRules.sort((leftRule, rightRule) => {
    const leftPriority = BuildRulePriority(leftRule);
    const rightPriority = BuildRulePriority(rightRule);

    if (rightPriority[0] !== leftPriority[0]) {
      return rightPriority[0] - leftPriority[0];
    }

    return rightPriority[1] - leftPriority[1];
  });

  return NormalizeStandingStatus(matchingRules[0].label, {
    ...context,
    rule: matchingRules[0],
  });
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
 * Builds an AcademicStanding bulkWrite operation for one student.
 *
 * Missing grades keep their test snapshot with total_mark 0 and are evaluated
 * against the configured grading rules like any submitted score.
 *
 * @param {string} studentId - Student identifier.
 * @param {string} academicYearId - Academic year identifier.
 * @param {Object} hierarchy - Loaded block hierarchy.
 * @param {Map} scoreLookup - Student/test score lookup map.
 * @param {Object} options - Build options.
 * @returns {Object} bulkWrite updateOne operation.
 */
function BuildAcademicStandingBulkOperation(studentId, academicYearId, hierarchy, scoreLookup, options = {}) {
  if (!options.skipHierarchyValidation) {
    ValidateGradingHierarchyConfiguration(hierarchy);
  }

  const evaluationOptions = {
    skipRuleValidation: true,
  };

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
      const totalMark = scoreLookup.has(scoreLookupKey) ? RoundMark(scoreLookup.get(scoreLookupKey)) : 0;

      return {
        test_id: test._id,
        weightage: test.weightage,
        total_mark: totalMark,
        test_status: EvaluateStandingStatus(totalMark, test.grading_rules, {
          level: 'test',
          test_id: test._id?.toString(),
          student_id: studentId,
        }, evaluationOptions),
      };
    });

    const subjectAverage = CalculateAverage(computedTests, 'total_mark', 'weightage');

    return {
      subject_id: subject._id,
      weightage: subject.weightage,
      subject_average: subjectAverage,
      subject_status: EvaluateStandingStatus(subjectAverage, subject.grading_rules, {
        level: 'subject',
        subject_id: subject._id?.toString(),
        student_id: studentId,
      }, evaluationOptions),
      tests: computedTests.map((test) => ({
        test_id: test.test_id,
        total_mark: test.total_mark,
        test_status: test.test_status,
      })),
    };
  });

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
          block_status: EvaluateStandingStatus(blockAverage, hierarchy.block.grading_rules, {
            level: 'block',
            block_id: hierarchy.block._id?.toString(),
            student_id: studentId,
          }, evaluationOptions),
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
 * Confirms that the submitted test hierarchy belongs to the selected academic year.
 *
 * @param {Object} existingSubject - Parent subject for the submitted test.
 * @param {Object} existingAcademicYear - Selected academic year document.
 * @param {Object|null} matchingBlock - Block matched by id and academic year.
 * @returns {void}
 * @throws {AppError} When either side of the academic year relationship is invalid.
 */
function ValidateGradeSubmissionAcademicYear(existingSubject, existingAcademicYear, matchingBlock) {
  const academicYearBlockIdSet = new Set(existingAcademicYear.block_ids.map((blockId) => String(blockId)));

  if (!matchingBlock || !academicYearBlockIdSet.has(String(existingSubject.block_id))) {
    throw new AppError('TEST_ACADEMIC_YEAR_MISMATCH', 400, 'Test does not belong to the selected academic year');
  }
}

/**
 * Initializes indexes required by grade aggregation before workers run.
 *
 * @returns {Promise<void>}
 */
async function InitializeGradeAggregationIndexes() {
  await Promise.all([AcademicStandingModel.init(), SubjectModel.init(), TestModel.init()]);
}

/**
 * Submits a batch of test grades
 * using pre-validation before any
 * database write occurs.
 *
 * The academic standing worker is spawned only after StudentGrade insertMany
 * succeeds. The worker is intentionally not awaited so the mutation can return
 * the inserted grade documents while aggregation continues in the background.
 *
 * @param {Object} input - Payload containing academic year, test, and student scores.
 * @returns {Promise<Array>} Inserted student grade documents.
 * @throws {AppError} 400 - Invalid student reference or duplicate payload student.
 * @throws {AppError} 404 - Test or academic year not found.
 */
async function SubmitTestGradesHelper(input) {
  // *************** START: Validate input payload ***************
  const validatedInput = ValidateInputWithJoi(SubmitTestGradesSchema, input);
  // *************** END: Validate input payload ***************

  // *************** START: Validate curriculum and cohort references ***************
  const [existingTest, existingAcademicYear] = await Promise.all([
    TestModel.findById(validatedInput.test_id).select('_id subject_id').lean(),
    AcademicYearModel.findById(validatedInput.academic_year_id).select('_id block_ids student_ids').lean(),
  ]);

  if (!existingTest) {
    throw new AppError('TEST_NOT_FOUND', 404, 'Test not found');
  }

  if (!existingAcademicYear) {
    throw new AppError('ACADEMIC_YEAR_NOT_FOUND', 404, 'Academic year not found');
  }

  const existingSubject = await SubjectModel.findById(existingTest.subject_id).select('_id block_id').lean();

  if (!existingSubject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found');
  }

  const matchingBlock = await BlockModel.findOne({
    _id: existingSubject.block_id,
    academic_year_id: validatedInput.academic_year_id,
  })
    .select('_id')
    .lean();
  ValidateGradeSubmissionAcademicYear(existingSubject, existingAcademicYear, matchingBlock);
  // *************** END: Validate curriculum and cohort references ***************

  // *************** START: Prepare student reference validation ***************
  const extractedStudentIds = validatedInput.grades.map((grade) => String(grade.student_id));
  const uniqueStudentIds = [...new Set(extractedStudentIds)];

  if (uniqueStudentIds.length !== extractedStudentIds.length) {
    throw new AppError('DUPLICATE_STUDENT_GRADE_INPUT', 400, 'Duplicate student grade input');
  }

  const enrolledStudentIdSet = new Set(existingAcademicYear.student_ids.map((studentId) => String(studentId)));
  const validStudents = await StudentModel.find({
    _id: {
      $in: uniqueStudentIds,
    },
  }).select('_id').lean();
  const validStudentIdSet = new Set(validStudents.map((student) => String(student._id)));

  const existingGrades = await StudentGradeModel.find({
    academic_year_id: validatedInput.academic_year_id,
    test_id: validatedInput.test_id,
    student_id: {
      $in: uniqueStudentIds,
    },
  }).select('student_id').lean();

  const existingGradeStudentIdSet = new Set(existingGrades.map((grade) => String(grade.student_id)));
  // *************** END: Prepare student reference validation ***************

  // *************** START: Pre-validate every grade before bulk insert ***************
  for (const grade of validatedInput.grades) {
    const studentId = String(grade.student_id);

    if (!validStudentIdSet.has(studentId)) {
      throw new AppError('INVALID_STUDENT_REFERENCE', 400, 'Invalid student reference');
    }

    if (!enrolledStudentIdSet.has(studentId)) {
      throw new AppError('STUDENT_NOT_ENROLLED_IN_ACADEMIC_YEAR', 400, 'Student is not enrolled in academic year');
    }

    if (existingGradeStudentIdSet.has(studentId)) {
      throw new AppError('DUPLICATE_STUDENT_GRADE', 409, 'Student grade already exists');
    }
  }
  // *************** END: Pre-validate every grade before bulk insert ***************

  // *************** START: Transform and insert grade batch ***************
  const mappedGrades = validatedInput.grades.map((grade) => ({
    student_id: grade.student_id,
    test_id: validatedInput.test_id,
    academic_year_id: validatedInput.academic_year_id,
    score: grade.score,
  }));

  const insertedGrades = await StudentGradeModel.insertMany(mappedGrades, { ordered: true });
  // *************** END: Transform and insert grade batch ***************

  // *************** START: Trigger non-blocking academic standing aggregation ***************
  SpawnGradeAggregatorWorker(validatedInput, uniqueStudentIds);
  // *************** END: Trigger non-blocking academic standing aggregation ***************

  return insertedGrades;
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildAcademicStandingBulkOperation,
  BuildScoreLookupKey,
  CalculateAverage,
  CompareRuleValue,
  EvaluateStandingStatus,
  InitializeGradeAggregationIndexes,
  PENDING_STANDING_STATUS,
  SubmitTestGradesHelper,
  ValidateGradeSubmissionAcademicYear,
  ValidateGradingHierarchyConfiguration,
  ValidateGradingRulesConfiguration,
};
