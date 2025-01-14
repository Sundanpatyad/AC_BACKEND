const AttemptDetails = require('../models/attemptDetails'); // Adjust the path as needed
const User = require('../models/user'); // Adjust the path as needed
const mongoose = require('mongoose');

exports.createAttempt = async (req, res) => {
  try {
    const {
      mockId,
      testName,
      score,
      totalQuestions,
      timeTaken,
      correctAnswers,
      incorrectAnswers,
      incorrectAnswerDetails
    } = req.body;
    const userId = req.user.id;

    const newAttempt = new AttemptDetails({
      user: userId,
      mockTestSeries: mockId,
      testName,
      score,
      totalQuestions,
      timeTaken,
      correctAnswers,
      incorrectAnswers,
      incorrectAnswerDetails
    });

    await newAttempt.save();

    await User.findByIdAndUpdate(userId, {
      $addToSet: { 
        mocktests: mockId,
        attempts: newAttempt._id 
      }
    });

    res.status(201).json({
      success: true,
      message: 'Attempt recorded successfully',
      attempt: newAttempt
    });
  } catch (error) {
    console.error('Error in createAttempt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record attempt',
      error: error.message
    });
  }
};

exports.getAttemptsByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user details
    const user = await User.findById(userId)
      .select('firstName lastName email accountType image')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Fetch attempts with populated fields
    const attempts = await AttemptDetails.find({ user: userId })
      .populate('mockTestSeries', 'seriesName totalQuestions duration') // Adjust fields as needed
      .sort({ createdAt: -1 })
      .lean();

    // Calculate some statistics
    const totalAttempts = attempts.length;
    const averageScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0) / totalAttempts;

    res.status(200).json({
      success: true,
      user: {
        ...user,
        totalAttempts,
        averageScore: averageScore.toFixed(2)
      },
      attempts
    });
  } catch (error) {
    console.error('Error in getAttemptsByUser:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve attempts and user details',
      error: error.message
    });
  }
};

exports.getAttemptById = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await AttemptDetails.findById(attemptId)
                                        .populate('user', 'firstName lastName email')
                                        .populate('mockTestSeries', 'seriesName');

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Attempt not found'
      });
    }

    res.status(200).json({
      success: true,
      attempt
    });
  } catch (error) {
    console.error('Error in getAttemptById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve attempt',
      error: error.message
    });
  }
};

exports.getAttemptsByMockTest = async (req, res) => {
  try {
    const { mockId } = req.params;
    const attempts = await AttemptDetails.find({ mockTestSeries: mockId })
                                         .populate('user', 'firstName lastName email')
                                         .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      attempts
    });
  } catch (error) {
    console.error('Error in getAttemptsByMockTest:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve attempts',
      error: error.message
    });
  }
};


exports.getRankings = async (req, res) => {
  try {
    const rankings = await AttemptDetails.aggregate([
      // Sort by attemptDate in descending order
      { $sort: { attemptDate: -1 } },
      
      // Group by user and testName to get the latest attempt for each user per test
      {
        $group: {
          _id: { user: '$user', testName: '$testName' },
          latestAttempt: { $first: '$$ROOT' }
        }
      },
      
      // Unwind to flatten the result
      { $replaceRoot: { newRoot: '$latestAttempt' } },
      
      // Sort by score in descending order
      { $sort: { score: -1 } },
      
      // Add rank field
      {
        $setWindowFields: {
          partitionBy: '$testName',
          sortBy: { score: -1 },
          output: {
            rank: {
              $rank: {}
            }
          }
        }
      },
      
      // Lookup to get user details
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      
      { $unwind: '$userDetails' },
      
      // Project only necessary fields
      {
        $project: {
          rank: 1,
          userId: '$user', // Include the user's ID
          userName: {
            $concat: ['$userDetails.firstName', ' ', '$userDetails.lastName']
          },
          score: 1,
          testName: 1,
          attemptDate: 1,
          userImage: '$userDetails.image'
        }
      },
      
      // Sort by testName and then by rank
      { $sort: { testName: 1, rank: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: rankings
    });
  } catch (error) {
    console.error('Error in getRankings:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching rankings'
    });
  }
};



