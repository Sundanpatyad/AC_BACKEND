const Razorpay = require('razorpay');
const instance = require('../config/rajorpay');
const crypto = require('crypto');
const mailSender = require('../utils/mailSender');
require('dotenv').config();

const User = require('../models/user');
const { MockTestSeries } = require('../models/mockTestSeries');

const { default: mongoose } = require('mongoose');

// Capture the payment and Initiate the 'Razorpay order' for mock tests
exports.captureMockTestPayment = async (req, res) => {
    const { itemId } = req.body;
    const mockTestIds = Array.isArray(itemId) ? itemId : [itemId];
    //console.log(mockTestIds);
    //console.log(req.body);
    const userId = req.user.id;

    if (mockTestIds.length === 0) {
        return res.status(400).json({ success: false, message: "Please provide Mock Test Series Id" });
    }

    let totalAmount = 0;
    for (const mockTestId of mockTestIds) {
        let mockTestSeries;
        try {
            mockTestSeries = await MockTestSeries.findById(mockTestId);
            if (!mockTestSeries) {
                return res.status(404).json({ success: false, message: `Could not find the mock test series with id ${mockTestId}` });
            }

            const uid = new mongoose.Types.ObjectId(userId);
            
            if (mockTestSeries.studentsEnrolled.includes(uid)) {
                return res.status(400).json({ success: false, message: "User has already purchased this mock test series" });
            }

            totalAmount += mockTestSeries.price || 0;
        }
        catch (error) {
            //console.log(error);
            return res.status(500).json({ success: false, message: `Error processing mock test series ${mockTestId}: ${error.message}` });
        }
    }

    const currency = "INR";
    const options = {
        amount: totalAmount * 100,
        currency,
        receipt: Math.random(Date.now()).toString(),
    }

    try {
        const paymentResponse = await instance.instance.orders.create(options);
        res.status(200).json({
            success: true,
            message: paymentResponse,
        })
    }
    catch (error) {
        //console.log(error);
        return res.status(500).json({ success: false, message: "Could not Initiate Order" });
    }
}

// Verify the payment for mock tests
exports.verifyMockTestPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId } = req.body;
        //console.log({ razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId })
        const userId = req.user.id;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !itemId || !userId) {
            return res.status(400).json({ success: false, message: "Payment verification failed. Missing required data." });
        }

        let body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            const grantAccessResult = await grantMockTestAccess(itemId, userId);
            if (grantAccessResult.success) {
                return res.status(200).json({ success: true, message: "Payment verified and access granted successfully." });
            } else {
                return res.status(500).json({ success: false, message: grantAccessResult.message });
            }
        } else {
            return res.status(400).json({ success: false, message: "Payment signature verification failed." });
        }
    } catch (error) {
        console.error("Error in verifyMockTestPayment:", error);
        return res.status(500).json({ success: false, message: "Internal server error during payment verification." });
    }
}

// Grant access to mock tests after payment
const grantMockTestAccess = async (itemId, userId) => {
    if (!itemId || !userId) {
        return { success: false, message: "Missing mock test IDs or user ID." };
    }

    const mockTestIdArray = Array.isArray(itemId) ? itemId : [itemId];
    
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for (const mockTestId of mockTestIdArray) {
            const updatedMockTestSeries = await MockTestSeries.findOneAndUpdate(
                { _id: mockTestId },
                { $addToSet: { studentsEnrolled: userId } },
                { new: true, session } // Pass session here
            );

            if (!updatedMockTestSeries) {
                await session.abortTransaction();
                session.endSession();
                return { success: false, message: `Mock Test Series with ID ${mockTestId} not found.` };
            }

            await User.findByIdAndUpdate(
                userId,
                {
                    $addToSet: {
                        mocktests: mockTestId,
                    },
                },
                { new: true, session } // Pass session here
            );

            // Send email notification
            try {
                const user = await User.findById(userId).session(session);
                await mailSender(
                    user.email,
                    `Successfully Purchased ${updatedMockTestSeries.seriesName}`,
                    `Congratulations! You have successfully purchased the mock test series: ${updatedMockTestSeries.seriesName}`
                );
            } catch (emailError) {
                console.error("Error sending email:", emailError);
                // Continue execution even if email fails
            }
        }

        await session.commitTransaction();
        session.endSession();

        return { success: true, message: "Access granted successfully to all mock test series." };
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error in grantMockTestAccess:", error);
        return { success: false, message: "Error granting access to mock test series: " + error.message };
    }
};

exports.sendMockTestPaymentSuccessEmail = async (req, res) => {
    const { orderId, paymentId, amount } = req.body;
    const userId = req.user.id;

    if (!orderId || !paymentId || !amount || !userId) {
        return res.status(400).json({ success: false, message: "Please provide all the fields" });
    }

    try {
        const user = await User.findById(userId);
        await mailSender(
            user.email,
            `Payment Received for Mock Test Series`,
            `Dear ${user.firstName},\n\nYour payment of INR ${amount / 100} has been received successfully.\nOrder ID: ${orderId}\nPayment ID: ${paymentId}\n\nThank you for your purchase!`
        )
        res.status(200).json({ success: true, message: "Payment success email sent" });
    }
    catch (error) {
        //console.log("error in sending mail", error)
        return res.status(500).json({ success: false, message: "Could not send email" })
    }
}