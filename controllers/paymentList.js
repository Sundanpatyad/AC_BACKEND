const User = require('../models/user');
const PaymentVerification = require('../models/paymentVerification');

const mockTestPurchasersController = {
  listPurchasers: async (req, res) => {
    try {
      // Find all payment verifications
      const paymentVerifications = await PaymentVerification.find().populate('userId');

      // Get unique user IDs who have made payments
      const userIds = [...new Set(paymentVerifications.map(pv => pv.userId._id))];

      // Find users with these IDs and populate their mock tests
      const users = await User.find({ _id: { $in: userIds } })
        .select('firstName lastName email mocktests')
        .populate('mocktests');

      // Format the response
      const formattedUsers = users.map(user => ({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        purchasedMockTests: user.mocktests.map(test => ({
          _id: test._id,
          seriesName: test.seriesName,
          totalTests: test.totalTests
        }))
      }));

      res.json({
        success: true,
        data: formattedUsers
      });
    } catch (error) {
      console.error('Error fetching mock test purchasers:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while fetching mock test purchasers',
        error: error.message
      });
    }
  }
};

module.exports = mockTestPurchasersController;