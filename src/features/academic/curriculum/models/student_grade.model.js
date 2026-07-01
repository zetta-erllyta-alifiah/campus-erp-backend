// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** GLOBAL VARIABLES ***************
const StudentGradeSchema =
    new mongoose.Schema(
        {
            student_id: {
                type:
                    mongoose.Schema
                        .Types.ObjectId,
                required: true,
            },

            block_id: {
                type:
                    mongoose.Schema
                        .Types.ObjectId,
            },

            subject_id: {
                type:
                    mongoose.Schema
                        .Types.ObjectId,
            },

            test_id: {
                type:
                    mongoose.Schema
                        .Types.ObjectId,
            },

            score: {
                type: Number,
                required: true,
            },
        },
        {
            timestamps: true,
        },
    );

const StudentGradeModel =
    mongoose.model(
        'StudentGrade',
        StudentGradeSchema,
    );

// *************** EXPORT MODULE ***************
module.exports =
    StudentGradeModel;