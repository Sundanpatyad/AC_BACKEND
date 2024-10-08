const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: false,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true
    },
    password: {
      type: String,
    },
    accountType: {
      type: String,
      enum: ['Admin', 'Instructor', 'Student'],
      required: true
    },
    active: {
      type: Boolean,
      default: true,
    },
    approved: {
      type: Boolean,
      default: true,
    },
    additionalDetails: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
      }
    ],
    mocktests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MockTestSeries'
      }
    ],
    attempts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AttemptDetails'
      }
    ],
    image: {
      type: String,
      required: false
    },
    token: {
      type: String
    },
    resetPasswordExpires: {
      type: Date
    },
    courseProgress: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CourseProgress'
      }
    ],
    mobileNumber: {
      type: String,
      required: false,
      unique: false,
      default: null,
    }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);



module.exports = User;