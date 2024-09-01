const mongoose = require('mongoose');

const attemptDetailsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    mockTestSeries: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockTestSeries',
      required: true
    },
    testName: {
      type: String,
      required: true,
      trim: true
    },
    score: {
      type: Number,
      required: true
    },
    totalQuestions: {
      type: Number,
      required: true
    },
    correctAnswers: {
      type: Number,
      required: true
    },
    incorrectAnswers: {
      type: Number,
      required: true
    },
    incorrectAnswerDetails: [
      {
        questionText: {
          type: String,
          required: true
        },
        userAnswer: {
          type: String,
          required: true
        },
        correctAnswer: {
          type: String,
          required: true
        }
      }
    ],
    timeTaken: {
      type: Number,  // in seconds
      required: true
    },
    completed: {
      type: Boolean,
      default: true
    },
    attemptDate: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AttemptDetails', attemptDetailsSchema);