// *************** IMPORT LIBRARY ***************
const Joi = require('joi');

// *************** GLOBAL VARIABLES ***************
const gradingRuleValidator = Joi.object({
    label: Joi.string()
        .trim()
        .required(),

    operator: Joi.string()
        .valid(
            '>',
            '>=',
            '<',
            '<=',
            '=='
        )
        .required(),

    threshold: Joi.number()
        .required(),
});

const CreateBlockValidator = Joi.object({
    name: Joi.string()
        .trim()
        .required(),

    academic_year: Joi.string()
        .trim()
        .required(),

    grading_rules: Joi.array()
        .items(
            gradingRuleValidator
        )
        .default([]),
});

const UpdateBlockValidator = Joi.object({
    name: Joi.string()
        .trim(),

    academic_year: Joi.string()
        .trim(),

    grading_rules: Joi.array()
        .items(
            gradingRuleValidator
        ),
}).min(1);

const CreateSubjectValidator = Joi.object({
    name: Joi.string()
        .trim()
        .required(),

    block_id: Joi.string()
        .required(),

    weightage: Joi.number()
        .positive()
        .max(100)
        .required(),

    grading_rules: Joi.array()
        .items(
            gradingRuleValidator
        )
        .default([]),
});

const UpdateSubjectValidator = Joi.object({
    name: Joi.string()
        .trim(),

    weightage: Joi.number()
        .positive()
        .max(100),

    grading_rules: Joi.array()
        .items(
            gradingRuleValidator
        ),
}).min(1);

const CreateTestValidator = Joi.object({
    name: Joi.string()
        .trim()
        .required(),

    subject_id: Joi.string()
        .required(),

    weightage: Joi.number()
        .positive()
        .max(100)
        .required(),

    grading_rules: Joi.array()
        .items(
            gradingRuleValidator
        )
        .default([]),
});

const UpdateTestValidator = Joi.object({
    name: Joi.string()
        .trim(),

    weightage: Joi.number()
        .positive()
        .max(100),

    grading_rules: Joi.array()
        .items(
            gradingRuleValidator
        ),
}).min(1);

// *************** EXPORT MODULE ***************
module.exports = {
    CreateBlockValidator,
    UpdateBlockValidator,

    CreateSubjectValidator,
    UpdateSubjectValidator,

    CreateTestValidator,
    UpdateTestValidator,
};