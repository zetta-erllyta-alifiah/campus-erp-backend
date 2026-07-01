// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************
const GradingRuleSchema =
    new mongoose.Schema(
        {
            label: {
                type: String,
                required: true,
                trim: true,
            },
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
            threshold: {
                type: Number,
                required: true,
            },
        },
        {
            _id: false,
        },
    );

// *************** EXPORT MODULE ***************
module.exports =
    GradingRuleSchema;