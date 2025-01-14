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

    console.log(userId , "UserId")

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
        console.log(paymentResponse , "PaymentResponcse")

        // Save the order with the idempotency key
         const order = await Order.create({
            userId,
            mockTestIds,
            amount: totalAmount,
            razorpayOrderId: paymentResponse.id,
            idempotencyKey
        });

        console.log(order , "Order Details on Capture Payment ")

        res.status(200).json({
            success: true,
            message: paymentResponse,
        });

    } catch (error) {
        console.error("Error in captureMockTestPayment:", error);
        return res.status(500).json({ success: false, message: "Could not initiate order" });
    }
};

exports.handleRazorpayWebhook = async (req, res) => {
    // Maximum number of retry attempts
    const MAX_RETRIES = 3;
    // Initial delay in milliseconds
    const INITIAL_DELAY = 1000;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function processWebhookWithRetry(attempt = 1) {
        const session = await mongoose.startSession();
        
        try {
            // Verify webhook signature
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
            const signature = req.headers['x-razorpay-signature'];
            
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

            session.startTransaction();

            const { payload } = req.body;
            const event = payload.payment.entity;

            console.log(event.order_id , "Order_id in Webhook ")

            switch(req.body.event) {
                case 'payment.captured': {
                    // Find the corresponding order
                    const order = await Order.findOne({ 
                        razorpayOrderId: event.order_id 
                    }).session(session);

                    console.log(order , "OrderDetails on WebHook ")
                    
                    if (!order) {
                        throw new Error('Order not found');
                    }

                    // Check for existing verification with session
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

                    // Update MockTestSeries with session and improved query
                    await MockTestSeries.bulkWrite([
                        {
                            updateMany: {
                                filter: {
                                    _id: { 
                                        $in: order.mockTestIds.map(id => 
                                            new mongoose.Types.ObjectId(id)
                                        ) 
                                    },
                                    studentsEnrolled: { 
                                        $ne: new mongoose.Types.ObjectId(order.userId) 
                                    }
                                },
                                update: {
                                    $addToSet: { 
                                        studentsEnrolled: new mongoose.Types.ObjectId(order.userId) 
                                    }
                                }
                            }
                        }
                    ], { session });

                    // Update user's mock tests
                    await User.bulkWrite([
                        {
                            updateOne: {
                                filter: { _id: new mongoose.Types.ObjectId(order.userId) },
                                update: { 
                                    $addToSet: { 
                                        mocktests: { 
                                            $each: order.mockTestIds.map(id => 
                                                new mongoose.Types.ObjectId(id)
                                            ) 
                                        } 
                                    } 
                                }
                            }
                        }
                    ], { session });

                    // Create payment verification record
                  const paymentVerify =  await PaymentVerification.create([{
                        userId: order.userId,
                        razorpayOrderId: event.order_id,
                        razorpayPaymentId: event.id,
                        mockTestIds: order.mockTestIds,
                        amount: event.amount / 100,
                        status: 'completed',
                        paymentMethod: event.method,
                        webhookProcessedAt: new Date()
                    }], { session });
                    
                    console.log(paymentVerify , "Payment Verification on WebHook")
                    
                    break;
                }

                case 'payment.failed': {
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

            // Check if error is a WriteConflict and we haven't exceeded max retries
            if (
                error.code === 112 && 
                error.errorLabels?.includes('TransientTransactionError') &&
                attempt < MAX_RETRIES
            ) {
                console.log(`Retry attempt ${attempt} after write conflict`);
                // Exponential backoff
                await sleep(INITIAL_DELAY * Math.pow(2, attempt - 1));
                return processWebhookWithRetry(attempt + 1);
            }

            throw error;
        } finally {
            session.endSession();
        }
    }

    try {
        return await processWebhookWithRetry();
    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error processing webhook',
            error: error.message
        });
    }
};