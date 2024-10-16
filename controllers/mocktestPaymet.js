const Order = require('../models/order');
const PaymentVerification = require('../models/paymentVerification')
const { MockTestSeries } = require('../models/mockTestSeries');
const crypto = require('crypto')
const { default: mongoose } = require('mongoose')
const User = require('../models/user')
const instance = require('../config/rajorpay')

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
        
        // Save the order with the idempotency key
        await Order.create({
            userId,
            mockTestIds,
            amount: totalAmount,
            razorpayOrderId: paymentResponse.id,
            idempotencyKey
        });

        res.status(200).json({
            success: true,
            message: paymentResponse,
        });
        
    } catch (error) {
        console.error("Error in captureMockTestPayment:", error);
        return res.status(500).json({ success: false, message: "Could not initiate order" });
    }
};

// Verify the payment for mock tests
exports.verifyMockTestPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId } = req.body;
    const userId = req.user.id;

    try {
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !itemId || !userId) {
            return res.status(400).json({ success: false, message: "Payment verification failed. Missing required data." });
        }

        // Check if this payment was already verified
        const existingVerification = await PaymentVerification.findOne({ razorpayOrderId: razorpay_order_id });
        if (existingVerification) {
            return res.status(200).json({ success: true, message: "Payment already verified" });
        }

        let body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Payment signature verification failed." });
        }

        const mockTestIds = Array.isArray(itemId) ? itemId : [itemId];

        // Update MockTestSeries and User in a single operation
        const updateResult = await MockTestSeries.updateMany(
            {
                _id: { $in: mockTestIds.map(id => new mongoose.Types.ObjectId(id)) },
                studentsEnrolled: { $ne: new mongoose.Types.ObjectId(userId) }
            },
            {
                $addToSet: { studentsEnrolled: new mongoose.Types.ObjectId(userId) }
            },
            { session }
        );

        if (updateResult.modifiedCount !== mockTestIds.length) {
            throw new Error("Failed to update all mock test series");
        }

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

        await session.commitTransaction();

        // // Send email asynchronously
        // const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
        // sendMockTestPaymentSuccessEmail(userId, razorpay_order_id, razorpay_payment_id, order.amount).catch(console.error);

        return res.status(200).json({ success: true, message: "Payment verified and access granted successfully." });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error in verifyMockTestPayment:", error);
        return res.status(500).json({ success: false, message: "Internal server error during payment verification." });
    } finally {
        session.endSession();
    }
};
