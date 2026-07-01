// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const GradingRuleSchema =
    require('./grading_rule.schema');

// *************** GLOBAL VARIABLES ***************
const SubjectSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true,
            },
            block_id: {
                type:
                    mongoose.Schema.Types.ObjectId,
                ref: 'Block',
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

const SubjectModel =
    mongoose.model(
        'Subject',
        SubjectSchema,
    );

// *************** EXPORT MODULE ***************
module.exports =
    SubjectModel;