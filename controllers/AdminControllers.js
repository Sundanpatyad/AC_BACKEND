const User = require('../models/user');
const { MockTestSeries } = require('../controllers/mockTestSeries');
const Order = require('../models/order');

const getUsersByMockTest = async (req, res) => {
  try {
    const mockTestStats = await User.aggregate([
      // Match users who have purchased mock tests
      { $match: { mocktests: { $exists: true, $ne: [] } } },
      
      // Unwind the mocktests array
      { $unwind: '$mocktests' },
      
      // Lookup to get mock test details
      {
        $lookup: {
          from: 'mocktestseries',
          localField: 'mocktests',
          foreignField: '_id',
          as: 'mockTestDetails'
        }
      },
      
      // Unwind the mockTestDetails array
      { $unwind: '$mockTestDetails' },
      
      // Group by mock test
      {
        $group: {
          _id: '$mockTestDetails.seriesName',
          totalUsers: { $sum: 1 },
          users: {
            $push: {
              userId: '$_id',
              firstName: '$firstName',
              lastName: '$lastName',
              email: '$email',
              mobileNumber: '$mobileNumber' // Add mobile number here
            }
          }
        }
      },
      
      // Reshape the output
      {
        $project: {
          _id: 0,
          testName: '$_id',
          totalUsers: 1,
          users: 1
        }
      },
      
      // Sort by test name
      { $sort: { testName: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: mockTestStats
    });
  } catch (error) {
    console.error('Error in getUsersByMockTest:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching user data',
      error: error.message
    });
  }
};

const getUsersWithoutAssignedMocks = async (req, res) => {
    try {
        // Aggregation pipeline to find users with paid orders but no mock tests assigned
        const pipeline = [
            {
                // Step 1: Join Order with User model
                $lookup: {
                    from: 'users', // Collection name of the User model
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                // Step 2: Unwind the userDetails array to work with individual user data
                $unwind: '$userDetails'
            },
            {
                // Step 3: Match orders where the status is 'paid' and no mock tests are assigned
                $match: {
                    status: 'paid',
                    mockTestIds: { $size: 0 } // Ensures the array is empty
                }
            },
            {
                // Step 4: Project required user details from the userDetails field
                $project: {
                    _id: 0, // Do not return the order's _id
                    userId: '$userDetails._id', // Return the user's _id
                    firstName: '$userDetails.firstName',
                    lastName: '$userDetails.lastName',
                    email: '$userDetails.email',
                    courses: '$userDetails.courses',
                    mocktests: '$userDetails.mocktests',
                    mobileNumber: '$userDetails.mobileNumber'
                }
            }
        ];

        // Step 5: Execute the aggregation query
        const usersWithoutMock = await Order.aggregate(pipeline);

        // Step 6: Return the result as a JSON response
        res.status(200).json({
            success: true,
            data: usersWithoutMock
        });
    } catch (error) {
        console.error('Error fetching users without assigned mock tests:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

module.exports = {
  getUsersByMockTest,
  getUsersWithoutAssignedMocks
};
