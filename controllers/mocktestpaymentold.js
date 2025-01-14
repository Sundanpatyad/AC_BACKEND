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

exports.verifyMockTestPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId } = req.body;
    const userId = req.user.id;

    try {
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !itemId || !userId) {
            return res.status(400).json({ success: false, message: "Payment verification failed. Missing required data." });
        }

        const existingVerification = await PaymentVerification.findOne({ razorpayOrderId: razorpay_order_id });
        if (existingVerification) {
            return res.status(201).json({ success: true, message: "Payment already verified" });
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
        const userObjectId = new mongoose.Types.ObjectId(userId);

        let retryAttempts = 3;
        let updateSuccess = false;

        console.log("retryAttempts", retryAttempts );
        console.log("updateSuccess", updateSuccess );
        

        while (retryAttempts > 0 && !updateSuccess) {
            try {
                const updateResult = await MockTestSeries.updateMany(
                    {
                        _id: { $in: mockTestIds.map(id => new mongoose.Types.ObjectId(id)) },
                        studentsEnrolled: { $ne: userObjectId }
                    },
                    {
                        $addToSet: { studentsEnrolled: userObjectId }
                    },
                    { session }
                );

                if (updateResult.modifiedCount === mockTestIds.length) {
                    updateSuccess = true; // All updates succeeded
                } else {
                    throw new Error("Not all mock test series were updated successfully.");
                }
            } catch (err) {
                retryAttempts -= 1;
                console.error(`Update failed, retrying... Attempts left: ${retryAttempts}`, err);
                if (retryAttempts === 0) {
                    throw new Error("Failed to update mock test series after multiple attempts");
                }
            }
        }

        await User.updateOne(
            { _id: userObjectId },
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

        return res.status(200).json({ success: true, message: "Payment verified and access granted successfully." });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error in verifyMockTestPayment:", error);
        return res.status(500).json({ success: false, message: "Internal server error during payment verification." });
    } finally {
        session.endSession();
    }
};

// Helper function to send email (not exposed as an API endpoint)
async function sendMockTestPaymentSuccessEmail(userId, orderId, paymentId, amount) {
    try {
        const user = await User.findById(userId);
        await mailSender(
            user.email,
            `Payment Received for Mock Test Series`,
            `Dear ${user.firstName},\n\nYour payment of INR ${amount / 100} has been received successfully.\nOrder ID: ${orderId}\nPayment ID: ${paymentId}\n\nThank you for your purchase!`
        );
        console.log(`Payment success email sent for order ${orderId}`);
    } catch (error) {
        console.error("Error in sending mail:", error);
    }
}
exports.handleRazorpayWebhook = async (req, res) => {
    try {
        // Verify webhook signature
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];

        console.log(signature , "ssssssss")
        
        const shasum = crypto.createHmac('sha256', webhookSecret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (signature !== digest) {
            console.error('Invalid webhook signature');
            return res.status(400).json({
                success: false,
                message: 'Invalid webhook signature'
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { payload } = req.body;
            const event = payload.payment.entity;

            // Handle different webhook events
            switch(req.body.event) {
                case 'payment.captured': {
                    // Find the corresponding order
                    const order = await Order.findOne({ 
                        razorpayOrderId: event.order_id 
                    }).session(session);

                    if (!order) {
                        throw new Error('Order not found');
                    }

                    // Verify if payment is already processed
                    const existingVerification = await PaymentVerification.findOne({ 
                        razorpayOrderId: event.order_id 
                    }).session(session);

                    if (existingVerification) {
                        await session.commitTransaction();
                        return res.status(200).json({ 
                            success: true, 
                            message: 'Payment already processed' 
                        });
                    }

                    // Update MockTestSeries enrollment with retry logic
                    let retryAttempts = 3;
                    let updateSuccess = false;

                    while (retryAttempts > 0 && !updateSuccess) {
                        try {
                            const updateResult = await MockTestSeries.updateMany(
                                {
                                    _id: { 
                                        $in: order.mockTestIds.map(id => 
                                            new mongoose.Types.ObjectId(id)
                                        ) 
                                    },
                                    studentsEnrolled: { 
                                        $ne: new mongoose.Types.ObjectId(order.userId) 
                                    }
                                },
                                {
                                    $addToSet: { 
                                        studentsEnrolled: new mongoose.Types.ObjectId(order.userId) 
                                    }
                                },
                                { session }
                            );

                            if (updateResult.modifiedCount === order.mockTestIds.length) {
                                updateSuccess = true;
                            } else {
                                throw new Error('Not all mock tests were updated');
                            }
                        } catch (err) {
                            retryAttempts--;
                            if (retryAttempts === 0) {
                                throw new Error('Failed to update mock tests after retries');
                            }
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }

                    // Update user's mock tests
                    await User.updateOne(
                        { _id: new mongoose.Types.ObjectId(order.userId) },
                        { 
                            $addToSet: { 
                                mocktests: { 
                                    $each: order.mockTestIds.map(id => 
                                        new mongoose.Types.ObjectId(id)
                                    ) 
                                } 
                            } 
                        },
                        { session }
                    );

                    // Create payment verification record
                    await PaymentVerification.create([{
                        userId: order.userId,
                        razorpayOrderId: event.order_id,
                        razorpayPaymentId: event.id,
                        mockTestIds: order.mockTestIds,
                        amount: event.amount,
                        status: 'completed',
                        paymentMethod: event.method,
                        webhookProcessedAt: new Date()
                    }], { session });

                   
                    break;
                }

                case 'payment.failed': {
                    // Handle failed payment
                    await PaymentVerification.create([{
                        userId: event.notes.userId,
                        razorpayOrderId: event.order_id,
                        razorpayPaymentId: event.id,
                        status: 'failed',
                        failureReason: event.error_description,
                        webhookProcessedAt: new Date()
                    }], { session });

                  
                    break;
                }

                // Add other payment status handlers as needed
                default:
                    console.log(`Unhandled webhook event: ${req.body.event}`);
            }

            await session.commitTransaction();
            return res.status(200).json({
                success: true,
                message: 'Webhook processed successfully'
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error processing webhook',
            error: error.message
        });
    }
};

// Helper function to send success email
async function sendPaymentSuccessEmail(userId, orderId, paymentId, amount) {
    try {
        const user = await User.findById(userId);
        await mailSender(
            user.email,
            'Payment Successful - Mock Test Series',
            `Dear ${user.firstName},

Thank you for your purchase! Your payment has been successfully processed.

Order Details:
- Amount: INR ${amount / 100}
- Order ID: ${orderId}
- Payment ID: ${paymentId}

You can now access your mock tests from your dashboard.

Best regards,
Your Platform Team`
        );
    } catch (error) {
        console.error('Error sending success email:', error);
        throw error;
    }
}

// Helper function to send failure email
async function sendPaymentFailureEmail(userId, orderId, errorDescription) {
    try {
        const user = await User.findById(userId);
        await mailSender(
            user.email,
            'Payment Failed - Mock Test Series',
            `Dear ${user.firstName},

We noticed that there was an issue with your recent payment attempt.

Order Details:
- Order ID: ${orderId}
- Error: ${errorDescription}

Please try again or contact our support team if you need assistance.

Best regards,
Your Platform Team`
        );
    } catch (error) {
        console.error('Error sending failure email:', error);
        throw error;
    }
}



exports.getIncompletePaymentUsers = async (req, res) => {
    try {
        // Find orders that exist but have not been fully verified
        const incompletePaymentOrders = await Order.aggregate([
            // Stage 1: Join with PaymentVerification to find unverified orders
            {
                $lookup: {
                    from: 'paymentverifications',
                    localField: 'razorpayOrderId',
                    foreignField: 'razorpayOrderId',
                    as: 'paymentVerification'
                }
            },
            // Stage 2: Filter for orders without complete payment verification
            {
                $match: {
                    paymentVerification: { $size: 0 } // No payment verification exists
                }
            },
            // Stage 3: Join with User to get user details
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            // Stage 4: Unwind user details
            {
                $unwind: '$userDetails'
            },
            // Stage 5: Project only the required fields
            {
                $project: {
                    userId: '$userDetails._id',
                    username: '$userDetails.firstName',
                    email: '$userDetails.email',
                    mockTestIds: 1,
                    amount: 1,
                    razorpayOrderId: 1,
                    createdAt: 1
                }
            }
        ]);

        // If no incomplete payment orders found
        if (incompletePaymentOrders.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No incomplete payment orders found',
                data: [],
                count: 0
            });
        }

        // Enrich the data with additional mock test details
        const enrichedOrders = await Promise.all(
            incompletePaymentOrders.map(async (order) => {
                // Fetch mock test details for each order
                const mockTests = await MockTestSeries.find({
                    _id: { $in: order.mockTestIds.map(id => new mongoose.Types.ObjectId(id)) }
                }).select('title price');

                return {
                    ...order,
                    mockTests: mockTests.map(test => ({
                        testId: test._id,
                        title: test.title,
                        price: test.price
                    }))
                };
            })
        );

        // Return the result
        return res.status(200).json({
            success: true,
            message: 'Incomplete payment users retrieved successfully',
            count: enrichedOrders.length,
            data: enrichedOrders
        });

    } catch (error) {
        console.error('Error in getIncompletePaymentUsers:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve incomplete payment users',
            error: error.message
        });
    }
};

