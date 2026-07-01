// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const GradingRuleSchema =
    require('./grading_rule.schema');

// *************** GLOBAL VARIABLES ***************
const TestSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true,
            },
            subject_id: {
                type:
                    mongoose.Schema.Types.ObjectId,
                ref: 'Subject',
                required: true,
            },
            weightage: {
                type: Number,
                required: true,
                min: 0,
                max: 100,
            },
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

const TestModel =
    mongoose.model(
        'Test',
        TestSchema,
    );

// *************** EXPORT MODULE ***************
module.exports =
    TestModel;