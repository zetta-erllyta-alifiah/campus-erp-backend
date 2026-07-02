// *************** IMPORT LIBRARY ***************
const mongoose =
    require('mongoose');

// *************** GLOBAL VARIABLES ***************

/**
 * Grading rule schema used by
 * Block, Subject, and Test.
 */
const GradingRuleSchema =
    new mongoose.Schema(
        {
            // Grade label
            label: {
                type: String,
                required: true,
                trim: true,
            },

            // Comparison operator
            operator: {
                type: String,
                enum: [
                    '>',
                    '>=',
                    '<',
                    '<=',
                    '==',
                ],
                required: true,
            },

            // Threshold value
            threshold: {
                type: Number,
                required: true,
            },
        },
        {
            _id: false,
        },
    );

/**
 * Curriculum block schema.
 */
const BlockSchema =
    new mongoose.Schema(
        {
            // Curriculum block name
            name: {
                type: String,
                required: true,
                trim: true,
            },

            // Academic year
            academic_year: {
                type: String,
                required: true,
                trim: true,
            },

            // Grading rules
            grading_rules: {
                type: [
                    GradingRuleSchema,
                ],
                default: [],
            },
        },
        {
            timestamps: true,
        },
    );

/**
 * Subject schema.
 */
const SubjectSchema =
    new mongoose.Schema(
        {
            // Subject name
            name: {
                type: String,
                required: true,
                trim: true,
            },

            // Parent curriculum block
            block_id: {
                type:
                    mongoose.Schema
                        .Types
                        .ObjectId,
                ref: 'Block',
                required: true,
            },

            // Subject contribution percentage
            weightage: {
                type: Number,
                required: true,
                min: 0,
                max: 100,
            },

            // Subject grading rules
            grading_rules: {
                type: [
                    GradingRuleSchema,
                ],
                default: [],
            },
        },
        {
            timestamps: true,
        },
    );

/**
 * Test schema.
 */
const TestSchema =
    new mongoose.Schema(
        {
            // Test name
            name: {
                type: String,
                required: true,
                trim: true,
            },

            // Parent subject
            subject_id: {
                type:
                    mongoose.Schema
                        .Types
                        .ObjectId,
                ref: 'Subject',
                required: true,
            },

            // Test contribution percentage
            weightage: {
                type: Number,
                required: true,
                min: 0,
                max: 100,
            },

            // Test grading rules
            grading_rules: {
                type: [
                    GradingRuleSchema,
                ],
                default: [],
            },
        },
        {
            timestamps: true,
        },
    );

/**
 * Student grade schema used
 * for relational locking.
 */
const StudentGradeSchema =
    new mongoose.Schema(
        {
            // Entity category
            entity_type: {
                type: String,
                enum: [
                    'BLOCK',
                    'SUBJECT',
                    'TEST',
                ],
                required: true,
            },

            // Locked entity id
            entity_id: {
                type:
                    mongoose.Schema
                        .Types
                        .ObjectId,
                required: true,
            },
        },
        {
            timestamps: true,
            collection:
                'student_grades',
        },
    );

const BlockModel =
    mongoose.model(
        'Block',
        BlockSchema,
    );

const SubjectModel =
    mongoose.model(
        'Subject',
        SubjectSchema,
    );

const TestModel =
    mongoose.model(
        'Test',
        TestSchema,
    );

const StudentGradeModel =
    mongoose.model(
        'StudentGrade',
        StudentGradeSchema,
    );

// *************** EXPORT MODULE ***************
module.exports = {
    BlockModel,
    SubjectModel,
    TestModel,
    StudentGradeModel,
};