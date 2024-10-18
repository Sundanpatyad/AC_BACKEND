const Order = require('../models/order');
const PaymentVerification = require('../models/paymentVerification');
const { MockTestSeries } = require('../models/mockTestSeries');
const crypto = require('crypto');
const { default: mongoose } = require('mongoose');
const User = require('../models/user');
const instance = require('../config/rajorpay');

// Helper function to generate idempotency key
function generateIdempotencyKey(userId, itemIds) {
    const data = `${userId}-${itemIds.sort().join('-')}-${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Capture the payment and Initiate the 'Razorpay order' for mock tests
exports.captureMockTestPayment = async (req, res) => {
    const { itemId } = req.body;
    const mockTestIds = Array.isArray(itemId) ? itemId : [itemId];
    const userId = req.user.id;
    const idempotencyKey = req.headers['idempotency-key'] || generateIdempotencyKey(userId, mockTestIds);

    if (mockTestIds.length === 0) {
        return res.status(400).json({ success: false, message: "Please provide Mock Test Series Id" });
    }

    try {
        // Check if this operation was already processed
        const existingOrder = await Order.findOne({ idempotencyKey });
        if (existingOrder) {
            console.log(`Order already processed for idempotency key: ${idempotencyKey}`);
            return res.status(200).json({ success: true, message: "Order already processed", order: existingOrder });
        }

        const result = await MockTestSeries.aggregate([
            {
                $match: {
                    _id: { $in: mockTestIds.map(id => new mongoose.Types.ObjectId(id)) },
                    studentsEnrolled: { $ne: new mongoose.Types.ObjectId(userId) }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$price" },
                    count: { $sum: 1 }
                }
            }
        ]);

        if (result.length === 0 || result[0].count !== mockTestIds.length) {
            console.warn(`Unavailable or already purchased mock tests for user ${userId}`);
            return res.status(400).json({ success: false, message: "One or more mock tests are unavailable or already purchased" });
        }
 
        const totalAmount = result[0].totalAmount;
        const currency = "INR";
        const options = {
            amount: totalAmount * 100,
            currency,
            receipt: Math.random(Date.now()).toString(),
        };

        const paymentResponse = await instance.instance.orders.create(options);
        console.log(`Razorpay order created: ${paymentResponse.id}`);

        // Save the order with the idempotency key
        await Order.create({
            userId,
            mockTestIds,
            amount: totalAmount,
            razorpayOrderId: paymentResponse.id,
            idempotencyKey,
            status: 'created'
        });

        res.status(200).json({
            success: true,
            message: paymentResponse,
        });
        
    } catch (error) {
        console.error(`Error in captureMockTestPayment: ${error.message}`);
        return res.status(500).json({ success: false, message: "Could not initiate order", error: error.message });
    }
};

// Verify the payment for mock tests
exports.verifyMockTestPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user.id;

    try {
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId) {
            return res.status(400).json({ success: false, message: "Payment verification failed. Missing required data." });
        }

        // Check if this payment was already verified
        const existingVerification = await PaymentVerification.findOne({ razorpayOrderId: razorpay_order_id });
        if (existingVerification) {
            console.log(`Payment already verified for order: ${razorpay_order_id}`);
            return res.status(200).json({ success: true, message: "Payment already verified" });
        }

        let body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            console.warn(`Payment signature verification failed for order: ${razorpay_order_id}`);
            return res.status(400).json({ success: false, message: "Payment signature verification failed." });
        }

        // Fetch the order
        const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
        if (!order) {
            throw new Error(`Order not found for Razorpay order ID: ${razorpay_order_id}`);
        }

        const mockTestIds = order.mockTestIds;

        // Update MockTestSeries and User
        const updatePromises = mockTestIds.map(async (testId) => {
            const updateResult = await MockTestSeries.updateOne(
                {
                    _id: new mongoose.Types.ObjectId(testId),
                    studentsEnrolled: { $ne: new mongoose.Types.ObjectId(userId) }
                },
                {
                    $addToSet: { studentsEnrolled: new mongoose.Types.ObjectId(userId) }
                },
                { session }
            );

            return updateResult.modifiedCount === 1;
        });

        const updateResults = await Promise.all(updatePromises);
        const successfulUpdates = updateResults.filter(result => result).length;

        await User.updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { $addToSet: { mocktests: { $each: mockTestIds.map(id => new mongoose.Types.ObjectId(id)) } } },
            { session }
        );

        await PaymentVerification.create([{
            userId,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            mockTestIds
        }], { session });

        // Update order status
        order.status = 'paid';
        await order.save({ session });

        await session.commitTransaction();

        console.log(`Payment verified for order: ${razorpay_order_id}. ${successfulUpdates}/${mockTestIds.length} tests allocated.`);

        // Send email asynchronously
        sendMockTestPaymentSuccessEmail(userId, razorpay_order_id, razorpay_payment_id, order.amount).catch(error => {
            console.error(`Failed to send success email: ${error.message}`);
        });

        return res.status(200).json({ 
            success: true, 
            message: "Payment verified and access granted successfully.",
            allocatedTests: successfulUpdates,
            totalTests: mockTestIds.length
        });
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error in verifyMockTestPayment: ${error.message}`);
        return res.status(500).json({ success: false, message: "Internal server error during payment verification.", error: error.message });
    } finally {
        session.endSession();
    }
};

// Helper function to send email (implement according to your email service)
async function sendMockTestPaymentSuccessEmail(userId, orderId, paymentId, amount) {
    // Implementation depends on your email service
    console.log(`Sending success email to user ${userId} for order ${orderId}`);
}