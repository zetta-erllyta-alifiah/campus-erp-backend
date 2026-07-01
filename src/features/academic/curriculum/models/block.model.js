// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const GradingRuleSchema =
    require('./grading_rule.schema');

// *************** GLOBAL VARIABLES ***************
const BlockSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true,
            },
            academic_year: {
                type: String,
                required: true,
                trim: true,
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

const BlockModel =
    mongoose.model(
        'Block',
        BlockSchema,
    );

// *************** EXPORT MODULE ***************
module.exports =
    BlockModel;