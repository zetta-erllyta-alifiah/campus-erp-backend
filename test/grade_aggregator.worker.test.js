process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_erp_test';
process.env.PORT = process.env.PORT || '4000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '1025';
process.env.SMTP_USER = process.env.SMTP_USER || 'test';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const {
  BuildAcademicStandingBulkOperation,
  BuildAggregationVersionKey,
  BuildGradeVersionKey,
  BuildScoreLookup,
  BuildScoreLookupKey,
  CalculateAverage,
  EvaluateStandingStatus,
  ExecuteAcademicStandingBulkWrite,
  HandleWorkerFailure,
  LoadCurriculumHierarchy,
  ParseWorkerPayload,
  ValidateAcademicYearHierarchy,
} = require('../src/workers/grade_aggregator.worker');
const { BlockModel, SubjectModel, TestModel } = require('../src/features/academic/curriculum/curriculum.model');
const { AcademicYearModel } = require('../src/features/academic/enrollment/academic_year.model');
const { ValidateGradeSubmissionAcademicYear } = require('../src/features/academic/grading/grading.helper');
const { StudentGradeModel } = require('../src/features/academic/grading/student_grade.model');

const completeRules = [
  { label: 'Fail', operator: '<', threshold: 50 },
  { label: 'Retake', operator: '>=', threshold: 50 },
  { label: 'Pass', operator: '>=', threshold: 70 },
];

test('EvaluateStandingStatus calculates statuses from dynamic grading rules', () => {
  assert.equal(EvaluateStandingStatus(85, completeRules), 'Pass');
  assert.equal(EvaluateStandingStatus(55, completeRules), 'Retake');
  assert.equal(EvaluateStandingStatus(35, completeRules), 'Fail');
});

test('EvaluateStandingStatus passes the Day 8 test, subject, and block QA boundaries', () => {
  const testRules = [
    { label: 'Fail', operator: '<', threshold: 5 },
    { label: 'Pass', operator: '>=', threshold: 5 },
  ];
  const aggregateRules = [
    { label: 'Fail', operator: '<', threshold: 5 },
    { label: 'Retake', operator: '>=', threshold: 5 },
    { label: 'Pass', operator: '>=', threshold: 6 },
  ];

  assert.equal(EvaluateStandingStatus(4.99, testRules), 'Fail');
  assert.equal(EvaluateStandingStatus(5, testRules), 'Pass');
  assert.equal(EvaluateStandingStatus(5.5, aggregateRules), 'Retake');
  assert.equal(EvaluateStandingStatus(6, aggregateRules), 'Pass');
});

test('EvaluateStandingStatus supports every curriculum comparison operator', () => {
  assert.equal(EvaluateStandingStatus(6, [{ label: 'Pass', operator: '>', threshold: 5 }]), 'Pass');
  assert.equal(EvaluateStandingStatus(5, [{ label: 'Pass', operator: '<=', threshold: 5 }]), 'Pass');
  assert.equal(EvaluateStandingStatus(5, [{ label: 'Pass', operator: '==', threshold: 5 }]), 'Pass');
});

test('EvaluateStandingStatus rejects missing, invalid, and incomplete grading rules', () => {
  assert.throws(() => EvaluateStandingStatus(80, []), /Grading rules are required/);
  assert.throws(() => EvaluateStandingStatus(80, [{ label: 'Pass', operator: 'between', threshold: 70 }]), /Invalid grading rule/);
  assert.throws(() => EvaluateStandingStatus(80, [{ label: 'Excellent', operator: '>=', threshold: 70 }]), /Invalid grading rule label/);
  assert.throws(() => EvaluateStandingStatus(45, [{ label: 'Pass', operator: '>=', threshold: 70 }]), /No grading rule matched/);
  assert.throws(() => EvaluateStandingStatus(80, [{ label: 'Pass', operator: '>=', threshold: null }]), /Invalid grading rule/);
  assert.throws(() => EvaluateStandingStatus(Number.NaN, completeRules), /Invalid grading value/);
});

test('CalculateAverage uses weightage when available and arithmetic fallback otherwise', () => {
  assert.equal(CalculateAverage([], 'mark', 'weightage'), 0);
  assert.equal(
    CalculateAverage(
      [
        { mark: 80, weightage: 25 },
        { mark: 60, weightage: 75 },
      ],
      'mark',
      'weightage',
    ),
    65,
  );

  assert.equal(
    CalculateAverage(
      [
        { mark: 80, weightage: 0 },
        { mark: 60, weightage: 0 },
      ],
      'mark',
      'weightage',
    ),
    70,
  );
});

test('ParseWorkerPayload validates and deduplicates the stringified ID payload', () => {
  const studentId = new mongoose.Types.ObjectId().toString();
  const parsedPayload = ParseWorkerPayload(
    JSON.stringify({
      student_ids: [studentId, studentId],
      test_id: new mongoose.Types.ObjectId().toString(),
      academic_year_id: new mongoose.Types.ObjectId().toString(),
    }),
  );

  assert.deepEqual(parsedPayload.student_ids, [studentId]);
  assert.throws(() => ParseWorkerPayload('{invalid'), /Invalid grade aggregator payload/);
  assert.throws(
    () => ParseWorkerPayload(JSON.stringify({ student_ids: [] })),
    /Student ids are required/,
  );
  assert.throws(
    () => ParseWorkerPayload(JSON.stringify({ student_ids: [studentId] })),
    /Test id is required/,
  );
  assert.throws(
    () => ParseWorkerPayload(JSON.stringify({ student_ids: [studentId], test_id: 'test-1' })),
    /Academic year id is required/,
  );
});

test('BuildAcademicStandingBulkOperation creates a version-guarded upsert pipeline', () => {
  const studentId = new mongoose.Types.ObjectId().toString();
  const academicYearId = new mongoose.Types.ObjectId().toString();
  const blockId = new mongoose.Types.ObjectId();
  const subjectId = new mongoose.Types.ObjectId();
  const testId = new mongoose.Types.ObjectId();
  const scoreLookup = new Map([[BuildScoreLookupKey(studentId, testId), 80]]);
  const aggregationVersionKey = '2026-07-15T01:02:03.004Z|64b000000000000000000001|000000000001';

  const operation = BuildAcademicStandingBulkOperation(
    studentId,
    academicYearId,
    {
      block: {
        _id: blockId,
        grading_rules: completeRules,
      },
      subjects: [
        {
          _id: subjectId,
          weightage: 100,
          grading_rules: completeRules,
        },
      ],
      tests: [
        {
          _id: testId,
          subject_id: subjectId,
          weightage: 100,
          grading_rules: completeRules,
        },
      ],
    },
    scoreLookup,
    aggregationVersionKey,
  );

  assert.equal(operation.updateOne.upsert, true);
  assert.deepEqual(operation.updateOne.filter, {
    student_id: studentId,
    academic_year_id: academicYearId,
    block_id: blockId,
  });

  const setStage = operation.updateOne.update[0].$set;
  assert.deepEqual(setStage.aggregation_version_key.$cond[0], {
    $lte: [{ $ifNull: ['$aggregation_version_key', ''] }, aggregationVersionKey],
  });
  assert.equal(setStage.aggregation_version_key.$cond[1], aggregationVersionKey);
  assert.equal(setStage.block_average.$cond[1], 80);
  assert.equal(setStage.block_status.$cond[1], 'Pass');
  assert.equal(setStage.subjects.$cond[1][0].tests[0].total_mark, 80);
});

test('BuildAcademicStandingBulkOperation requires a grade snapshot version', () => {
  assert.throws(
    () => BuildAcademicStandingBulkOperation('64b000000000000000000001', '64b000000000000000000002', { block: {}, subjects: [], tests: [] }, new Map()),
    /Grade aggregation version is required/,
  );
});

test('bulk operations target each submitted student with an isolated score snapshot', () => {
  const studentIds = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];
  const academicYearId = new mongoose.Types.ObjectId().toString();
  const blockId = new mongoose.Types.ObjectId();
  const subjectId = new mongoose.Types.ObjectId();
  const testId = new mongoose.Types.ObjectId();
  const hierarchy = {
    block: { _id: blockId, grading_rules: completeRules },
    subjects: [{ _id: subjectId, weightage: 100, grading_rules: completeRules }],
    tests: [{ _id: testId, subject_id: subjectId, weightage: 100, grading_rules: completeRules }],
  };
  const scoreLookup = new Map([
    [BuildScoreLookupKey(studentIds[0], testId), 80],
    [BuildScoreLookupKey(studentIds[1], testId), 60],
  ]);
  const operations = studentIds.map((studentId, index) => {
    return BuildAcademicStandingBulkOperation(
      studentId,
      academicYearId,
      hierarchy,
      scoreLookup,
      `2026-07-15T01:02:0${index + 3}.004Z|64b00000000000000000000${index + 1}|000000000001`,
    );
  });

  assert.equal(operations.length, 2);
  assert.equal(operations[0].updateOne.filter.student_id, studentIds[0]);
  assert.equal(operations[1].updateOne.filter.student_id, studentIds[1]);
  assert.equal(operations[0].updateOne.update[0].$set.block_average.$cond[1], 80);
  assert.equal(operations[1].updateOne.update[0].$set.block_average.$cond[1], 60);
});

test('BuildGradeVersionKey orders grade snapshots by timestamp and id', () => {
  const older = BuildGradeVersionKey({
    _id: new mongoose.Types.ObjectId('64b000000000000000000001'),
    updated_at: new Date('2026-07-15T01:02:03.004Z'),
  });
  const newer = BuildGradeVersionKey({
    _id: new mongoose.Types.ObjectId('64b000000000000000000002'),
    updated_at: new Date('2026-07-15T01:02:03.004Z'),
  });

  assert.equal(older < newer, true);
  assert.throws(() => BuildGradeVersionKey({ _id: older.split('|')[1] }), /Invalid grade version/);
});

test('BuildAggregationVersionKey advances when an immutable snapshot contains more grades', () => {
  const latestGradeVersionKey = '2026-07-15T01:02:03.004Z|64b000000000000000000001';
  const olderSnapshot = BuildAggregationVersionKey(latestGradeVersionKey, 1);
  const newerSnapshot = BuildAggregationVersionKey(latestGradeVersionKey, 2);

  assert.equal(olderSnapshot < newerSnapshot, true);
  assert.throws(() => BuildAggregationVersionKey(latestGradeVersionKey, 0), /Invalid aggregation version/);
});

test('BuildScoreLookup retrieves projected academic-year grades and versions each student snapshot', async () => {
  const originalFind = StudentGradeModel.find;
  const studentId = new mongoose.Types.ObjectId();
  const testIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const academicYearId = new mongoose.Types.ObjectId();
  const capturedQuery = {};

  try {
    StudentGradeModel.find = (filter) => {
      capturedQuery.filter = filter;

      return {
        select(projection) {
          capturedQuery.projection = projection;
          return this;
        },
        async lean() {
          return [
            {
              _id: new mongoose.Types.ObjectId('64b000000000000000000001'),
              student_id: studentId,
              test_id: testIds[0],
              score: 80,
              updated_at: new Date('2026-07-15T01:02:03.004Z'),
            },
            {
              _id: new mongoose.Types.ObjectId('64b000000000000000000002'),
              student_id: studentId,
              test_id: testIds[1],
              score: 60,
              updated_at: new Date('2026-07-15T01:02:04.004Z'),
            },
          ];
        },
      };
    };

    const result = await BuildScoreLookup(
      [studentId.toString()],
      testIds.map((_id) => ({ _id })),
      academicYearId.toString(),
    );

    assert.equal(result.scoreLookup.get(BuildScoreLookupKey(studentId, testIds[0])), 80);
    assert.equal(
      result.aggregationVersionByStudentId.get(studentId.toString()),
      '2026-07-15T01:02:04.004Z|64b000000000000000000002|000000000002',
    );
    assert.equal(capturedQuery.filter.academic_year_id, academicYearId.toString());
    assert.equal(capturedQuery.projection, '_id student_id test_id score created_at updated_at');
  } finally {
    StudentGradeModel.find = originalFind;
  }
});

test('LoadCurriculumHierarchy uses projected and indexed hierarchy queries', async () => {
  const originals = {
    testFindById: TestModel.findById,
    testFind: TestModel.find,
    subjectFindById: SubjectModel.findById,
    subjectFind: SubjectModel.find,
    blockFindById: BlockModel.findById,
    academicYearFindOne: AcademicYearModel.findOne,
  };
  const academicYearId = new mongoose.Types.ObjectId();
  const blockId = new mongoose.Types.ObjectId();
  const subjectId = new mongoose.Types.ObjectId();
  const testId = new mongoose.Types.ObjectId();
  const queryDetails = {};
  const createQuery = (result, key) => ({
    select(projection) {
      queryDetails[`${key}Projection`] = projection;
      return this;
    },
    sort(sort) {
      queryDetails[`${key}Sort`] = sort;
      return this;
    },
    async lean() {
      return result;
    },
  });

  try {
    TestModel.findById = () => createQuery({ _id: testId, subject_id: subjectId }, 'submittedTest');
    SubjectModel.findById = () => createQuery({ _id: subjectId, block_id: blockId }, 'submittedSubject');
    BlockModel.findById = () => createQuery(
      { _id: blockId, academic_year_id: academicYearId, grading_rules: completeRules },
      'block',
    );
    AcademicYearModel.findOne = () => createQuery({ _id: academicYearId }, 'academicYear');
    SubjectModel.find = () => createQuery(
      [{ _id: subjectId, block_id: blockId, weightage: 100, grading_rules: completeRules }],
      'subjects',
    );
    TestModel.find = () => createQuery(
      [{ _id: testId, subject_id: subjectId, weightage: 100, grading_rules: completeRules }],
      'tests',
    );

    const hierarchy = await LoadCurriculumHierarchy(testId.toString(), academicYearId.toString());

    assert.equal(hierarchy.block._id, blockId);
    assert.equal(queryDetails.submittedTestProjection, '_id subject_id');
    assert.equal(queryDetails.subjectsProjection, '_id weightage grading_rules');
    assert.deepEqual(queryDetails.subjectsSort, { created_at: 1, _id: 1 });
    assert.equal(queryDetails.testsProjection, '_id subject_id weightage grading_rules');
    assert.deepEqual(queryDetails.testsSort, { subject_id: 1, created_at: 1, _id: 1 });
  } finally {
    TestModel.findById = originals.testFindById;
    TestModel.find = originals.testFind;
    SubjectModel.findById = originals.subjectFindById;
    SubjectModel.find = originals.subjectFind;
    BlockModel.findById = originals.blockFindById;
    AcademicYearModel.findOne = originals.academicYearFindOne;
  }
});

test('version guard keeps the newer result when two workers finish out of order', () => {
  const olderVersion = '2026-07-15T01:02:03.004Z|64b000000000000000000001|000000000001';
  const newerVersion = '2026-07-15T01:02:03.004Z|64b000000000000000000001|000000000002';
  const applyWorkerResult = (storedVersion, incomingVersion) => {
    return !storedVersion || storedVersion <= incomingVersion ? incomingVersion : storedVersion;
  };

  const afterNewWorker = applyWorkerResult(null, newerVersion);
  const afterOldWorkerFinishesLast = applyWorkerResult(afterNewWorker, olderVersion);

  assert.equal(afterOldWorkerFinishesLast, newerVersion);
});

test('ExecuteAcademicStandingBulkWrite retries a concurrent first-upsert duplicate key race', async () => {
  const calls = [];
  const fakeStandingModel = {
    async bulkWrite(operations, options) {
      calls.push({ operations, options });

      if (calls.length === 1) {
        const duplicateKeyError = new Error('duplicate standing');
        duplicateKeyError.code = 11000;
        throw duplicateKeyError;
      }

      return { modifiedCount: 1 };
    },
  };
  const operations = [{ updateOne: { filter: { student_id: 'student-1' } } }];
  const result = await ExecuteAcademicStandingBulkWrite(operations, fakeStandingModel);

  assert.deepEqual(result, { modifiedCount: 1 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    operations,
    options: { ordered: false },
  });
});

test('ExecuteAcademicStandingBulkWrite does not retry non-duplicate database errors', async () => {
  let callCount = 0;
  const databaseError = new Error('database unavailable');
  const fakeStandingModel = {
    async bulkWrite() {
      callCount += 1;
      throw databaseError;
    },
  };

  await assert.rejects(() => ExecuteAcademicStandingBulkWrite([], fakeStandingModel), databaseError);
  assert.equal(callCount, 1);
});

test('ValidateAcademicYearHierarchy checks both block ownership directions', async () => {
  const originalFindOne = AcademicYearModel.findOne;
  const academicYearId = new mongoose.Types.ObjectId();
  const block = {
    _id: new mongoose.Types.ObjectId(),
    academic_year_id: academicYearId,
  };

  try {
    AcademicYearModel.findOne = () => ({
      select() {
        return this;
      },
      async lean() {
        return { _id: academicYearId };
      },
    });

    await ValidateAcademicYearHierarchy(block, academicYearId.toString());
    await assert.rejects(
      () => ValidateAcademicYearHierarchy(block, new mongoose.Types.ObjectId().toString()),
      /Test does not belong to the selected academic year/,
    );

    AcademicYearModel.findOne = () => ({
      select() {
        return this;
      },
      async lean() {
        return null;
      },
    });

    await assert.rejects(
      () => ValidateAcademicYearHierarchy(block, academicYearId.toString()),
      /Block does not belong to the selected academic year/,
    );
  } finally {
    AcademicYearModel.findOne = originalFindOne;
  }
});

test('grade submission hierarchy validation rejects mismatches before insertMany', () => {
  const blockId = new mongoose.Types.ObjectId();
  const subject = { block_id: blockId };
  const academicYear = { block_ids: [blockId] };

  assert.doesNotThrow(() => ValidateGradeSubmissionAcademicYear(subject, academicYear, { _id: blockId }));
  assert.throws(
    () => ValidateGradeSubmissionAcademicYear(subject, { block_ids: [] }, { _id: blockId }),
    /Test does not belong to the selected academic year/,
  );
  assert.throws(
    () => ValidateGradeSubmissionAcademicYear(subject, academicYear, null),
    /Test does not belong to the selected academic year/,
  );
});

test('curriculum indexes support the worker filter and sort order', () => {
  const subjectIndexes = SubjectModel.schema.indexes();
  const testIndexes = TestModel.schema.indexes();

  assert.equal(
    subjectIndexes.some(([fields]) => fields.block_id === 1 && fields.created_at === 1 && fields._id === 1),
    true,
  );
  assert.equal(
    testIndexes.some(([fields]) => fields.subject_id === 1 && fields.created_at === 1 && fields._id === 1),
    true,
  );
});

test('HandleWorkerFailure reports structured worker errors to the parent port', async () => {
  const messages = [];
  const fakePort = {
    postMessage(message) {
      messages.push(message);
    },
  };

  await HandleWorkerFailure(
    {
      code: 'GRADE_AGGREGATOR_TEST_ERROR',
      message: 'worker test failure',
    },
    fakePort,
  );

  assert.deepEqual(messages, [
    {
      status: 'error',
      code: 'GRADE_AGGREGATOR_TEST_ERROR',
      message: 'worker test failure',
    },
  ]);
});
