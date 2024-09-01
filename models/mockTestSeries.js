const mongoose = require('mongoose');

const MockTestSeriesSchema = new mongoose.Schema({
  seriesName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  attachments: [
    { name:{type:String},
      questionPaper: { type: String },
      answerKey: { type: String },
      omrSheet: { type: String },
    }

  ],
  mockTests: [
    {
      testName: { type: String, required: true },
      questions: [
        {
          text: { type: String, required: true },
          options: [{ type: String, required: true }],
          correctAnswer: { type: String, required: true },
        }
      ],
      duration: { type: Number, required: true },
      price: { type: Number },
      status: { type: String, enum: ['published', 'draft'], default: 'published' },
      studentsEnrolled: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        }
      ],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  totalTests: {
    type: Number,
    default: 0
  },
  thumbnail: {
    type: String
  },
  price: {
    type: Number,

  },
  itemType: {
    type: String,
    default: 'mocktest'
  },
  status: {
    type: String,
    enum: ['published', 'draft'],
    default: 'published'
  },
  studentsEnrolled: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  ],
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const MockTestSeries = mongoose.model('MockTestSeries', MockTestSeriesSchema);

module.exports = { MockTestSeries };
