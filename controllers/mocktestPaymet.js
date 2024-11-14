const Order = require("../models/order");
const PaymentVerification = require("../models/paymentVerification");
const { MockTestSeries } = require("../models/mockTestSeries");
const crypto = require("crypto");
const { default: mongoose } = require("mongoose");
const User = require("../models/user");
const instance = require("../config/rajorpay");

// Helper function to generate idempotency key
function generateIdempotencyKey(userId, itemIds) {
  const data = `${userId}-${itemIds.sort().join("-")}-${Date.now()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Capture the payment and Initiate the 'Razorpay order' for mock tests
exports.captureMockTestPayment = async (req, res) => {
  const { itemId } = req.body;
  const mockTestIds = Array.isArray(itemId) ? itemId : [itemId];
  const userId = req.user.id;
  const idempotencyKey =
    req.headers["idempotency-key"] ||
    generateIdempotencyKey(userId, mockTestIds);

  if (mockTestIds.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide Mock Test Series Id" });
  }

  try {
    // Check if this operation was already processed
    const existingOrder = await Order.findOne({ idempotencyKey });
    if (existingOrder) {
      return res
        .status(200)
        .json({
          success: true,
          message: "Order already processed",
          order: existingOrder,
        });
    }

    const result = await MockTestSeries.aggregate([
      {
        $match: {
          _id: {
            $in: mockTestIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
          studentsEnrolled: { $ne: new mongoose.Types.ObjectId(userId) },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$price" },
          count: { $sum: 1 },
        },
      },
    ]);

    if (result.length === 0 || result[0].count !== mockTestIds.length) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "One or more mock tests are unavailable or already purchased",
        });
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
      idempotencyKey,
    });

    res.status(200).json({
      success: true,
      message: paymentResponse,
    });
  } catch (error) {
    console.error("Error in captureMockTestPayment:", error);
    return res
      .status(500)
      .json({ success: false, message: "Could not initiate order" });
  }
};

exports.verifyMockTestPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId } =
    req.body;
  const userId = req.user.id;

  try {
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !itemId ||
      !userId
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Payment verification failed. Missing required data.",
        });
    }

    const existingVerification = await PaymentVerification.findOne({
      razorpayOrderId: razorpay_order_id,
    });
    if (existingVerification) {
      return res
        .status(201)
        .json({ success: true, message: "Payment already verified" });
    }

    let body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Payment signature verification failed.",
        });
    }

    const mockTestIds = Array.isArray(itemId) ? itemId : [itemId];
    const userObjectId = new mongoose.Types.ObjectId(userId);

    let retryAttempts = 3;
    let updateSuccess = false;

    console.log("retryAttempts", retryAttempts);
    console.log("updateSuccess", updateSuccess);

    while (retryAttempts > 0 && !updateSuccess) {
      try {
        const updateResult = await MockTestSeries.updateMany(
          {
            _id: {
              $in: mockTestIds.map((id) => new mongoose.Types.ObjectId(id)),
            },
            studentsEnrolled: { $ne: userObjectId },
          },
          {
            $addToSet: { studentsEnrolled: userObjectId },
          },
          { session }
        );

        if (updateResult.modifiedCount === mockTestIds.length) {
          updateSuccess = true; // All updates succeeded
        } else {
          throw new Error(
            "Not all mock test series were updated successfully."
          );
        }
      } catch (err) {
        retryAttempts -= 1;
        console.error(
          `Update failed, retrying... Attempts left: ${retryAttempts}`,
          err
        );
        if (retryAttempts === 0) {
          throw new Error(
            "Failed to update mock test series after multiple attempts"
          );
        }
      }
    }

    await User.updateOne(
      { _id: userObjectId },
      {
        $addToSet: {
          mocktests: {
            $each: mockTestIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
      { session }
    );

    await PaymentVerification.create(
      [
        {
          userId,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          mockTestIds,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res
      .status(200)
      .json({
        success: true,
        message: "Payment verified and access granted successfully.",
      });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error in verifyMockTestPayment:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error during payment verification.",
      });
  } finally {
    session.endSession();
  }
};

// Helper function to send email (not exposed as an API endpoint)
async function sendMockTestPaymentSuccessEmail(
  userId,
  orderId,
  paymentId,
  amount
) {
  try {
    const user = await User.findById(userId);
    await mailSender(
      user.email,
      `Payment Received for Mock Test Series`,
      `Dear ${user.firstName},\n\nYour payment of INR ${
        amount / 100
      } has been received successfully.\nOrder ID: ${orderId}\nPayment ID: ${paymentId}\n\nThank you for your purchase!`
    );
    console.log(`Payment success email sent for order ${orderId}`);
  } catch (error) {
    console.error("Error in sending mail:", error);
  }
}

// exports.handleRazorpayWebhook = async (req, res) => {
//     try {
//       // Verify webhook signature
//       const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
//       const signature = req.headers["x-razorpay-signature"];
  
//       console.log(signature, "Webhook Signature");
  
//       const shasum = crypto.createHmac("sha256", webhookSecret);
//       shasum.update(JSON.stringify(req.body));
//       const digest = shasum.digest("hex");
  
//       if (signature !== digest) {
//         console.error("Invalid webhook signature");
//         return res.status(400).json({
//           success: false,
//           message: "Invalid webhook signature",
//         });
//       }
  
//       const session = await mongoose.startSession();
//       session.startTransaction();
  
//       try {
//         const { payload } = req.body;
//         const event = payload.payment.entity;
  
//         console.log("Processing webhook event:", req.body.event);
  
//         switch (req.body.event) {
//           case "payment.captured": {
//             // Find the corresponding order
//             const order = await Order.findOne({
//               razorpayOrderId: event.order_id,
//             }).session(session);
  
//             console.log("Found order:", order);
  
//             if (!order) {
//               throw new Error(`Order not found for order_id: ${event.order_id}`);
//             }
  
//             // Verify if payment is already processed
//             const existingVerification = await PaymentVerification.findOne({
//               razorpayOrderId: event.order_id,
//             }).session(session);
  
//             if (existingVerification) {
//               await session.commitTransaction();
//               return res.status(200).json({
//                 success: true,
//                 message: "Payment already processed",
//               });
//             }
  
//             // First, verify all mockTestIds exist
//             const mockTests = await MockTestSeries.find({
//               _id: { 
//                 $in: order.mockTestIds.map(id => new mongoose.Types.ObjectId(id))
//               }
//             }).session(session);
  
//             if (mockTests.length !== order.mockTestIds.length) {
//               throw new Error("Some mock tests were not found");
//             }
  
//             // Update MockTestSeries enrollment with better error handling
//             const updateResult = await MockTestSeries.bulkWrite(
//               order.mockTestIds.map((mockTestId) => ({
//                 updateOne: {
//                   filter: {
//                     _id: new mongoose.Types.ObjectId(mockTestId),
//                     studentsEnrolled: {
//                       $ne: new mongoose.Types.ObjectId(order.userId)
//                     }
//                   },
//                   update: {
//                     $addToSet: {
//                       studentsEnrolled: new mongoose.Types.ObjectId(order.userId)
//                     }
//                   }
//                 }
//               })),
//               { session }
//             );
  
//             console.log("Mock test update result:", updateResult);
  
//             // Update user's mock tests
//             const userUpdateResult = await User.updateOne(
//               { _id: new mongoose.Types.ObjectId(order.userId) },
//               {
//                 $addToSet: {
//                   mocktests: {
//                     $each: order.mockTestIds.map(
//                       (id) => new mongoose.Types.ObjectId(id)
//                     ),
//                   },
//                 },
//               },
//               { session }
//             );
  
//             console.log("User update result:", userUpdateResult);
  
//             // Create payment verification record
//             const verification = await PaymentVerification.create([{
//               userId: order.userId,
//               razorpayOrderId: event.order_id,
//               razorpayPaymentId: event.id,
//               mockTestIds: order.mockTestIds,
//               amount: event.amount,
//               status: 'completed',
//               paymentMethod: event.method,
//               webhookProcessedAt: new Date()
//             }], { session });
  
//             console.log("Payment verification created:", verification);
  
//             break;
//           }
  
//           case "payment.failed": {
//             console.log("Processing failed payment");
//             await PaymentVerification.create(
//               [{
//                 userId: event.notes.userId,
//                 razorpayOrderId: event.order_id,
//                 razorpayPaymentId: event.id,
//                 status: "failed",
//                 failureReason: event.error_description,
//                 webhookProcessedAt: new Date(),
//               }],
//               { session }
//             );
//             break;
//           }
  
//           default:
//             console.log(`Unhandled webhook event: ${req.body.event}`);
//         }
  
//         await session.commitTransaction();
//         console.log("Webhook processed successfully");
//         return res.status(200).json({
//           success: true,
//           message: "Webhook processed successfully",
//         });
//       } catch (error) {
//         console.error("Error during transaction:", error);
//         await session.abortTransaction();
//         throw error;
//       } finally {
//         session.endSession();
//       }
//     } catch (error) {
//       console.error("Webhook processing error:", error);
//       return res.status(500).json({
//         success: false,
//         message: "Error processing webhook",
//         error: error.message,
//       });
//     }
//   };
// Helper function to send success email

exports.handleRazorpayWebhook = async (req, res) => {
    // Maximum number of transaction retry attempts
    const MAX_TRANSACTION_RETRIES = 3;
    
    try {
      // Verify webhook signature
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers["x-razorpay-signature"];
  
      const shasum = crypto.createHmac("sha256", webhookSecret);
      shasum.update(JSON.stringify(req.body));
      const digest = shasum.digest("hex");
  
      if (signature !== digest) {
        console.error("Invalid webhook signature");
        return res.status(400).json({
          success: false,
          message: "Invalid webhook signature",
        });
      }
  
      // Function to process the transaction with retries
      const processTransactionWithRetry = async () => {
        let retryCount = 0;
        
        while (retryCount < MAX_TRANSACTION_RETRIES) {
          const session = await mongoose.startSession();
          session.startTransaction();
  
          try {
            const { payload } = req.body;
            const event = payload.payment.entity;
  
            console.log("Processing webhook event:", req.body.event);
  
            switch (req.body.event) {
            //   case "payment.captured": {
            //     // Check for existing verification first (outside transaction)
            //     const existingVerification = await PaymentVerification.findOne({
            //       razorpayOrderId: event.order_id,
            //     });
  
            //     if (existingVerification) {
            //       await session.abortTransaction();
            //       session.endSession();
            //       return {
            //         success: true,
            //         message: "Payment already processed",
            //       };
            //     }
  
            //     // Find the order
            //     const order = await Order.findOne({
            //       razorpayOrderId: event.order_id,
            //     }).session(session);
  
            //     if (!order) {
            //       throw new Error(`Order not found for order_id: ${event.order_id}`);
            //     }
  
            //     // Update MockTestSeries one by one to reduce write conflicts
            //     for (const mockTestId of order.mockTestIds) {
            //       await MockTestSeries.updateOne(
            //         {
            //           _id: new mongoose.Types.ObjectId(mockTestId),
            //           studentsEnrolled: {
            //             $ne: new mongoose.Types.ObjectId(order.userId)
            //           }
            //         },
            //         {
            //           $addToSet: {
            //             studentsEnrolled: new mongoose.Types.ObjectId(order.userId)
            //           }
            //         },
            //         { session }
            //       );
            //     }
  
            //     // Update user's mock tests
            //     await User.updateOne(
            //       { _id: new mongoose.Types.ObjectId(order.userId) },
            //       {
            //         $addToSet: {
            //           mocktests: {
            //             $each: order.mockTestIds.map(
            //               (id) => new mongoose.Types.ObjectId(id)
            //             ),
            //           },
            //         },
            //       },
            //       { session }
            //     );
  
            //     // Create payment verification record
            //     await PaymentVerification.create([{
            //       userId: order.userId,
            //       razorpayOrderId: event.order_id,
            //       razorpayPaymentId: event.id,
            //       mockTestIds: order.mockTestIds,
            //       amount: event.amount,
            //       status: 'completed',
            //       paymentMethod: event.method,
            //       webhookProcessedAt: new Date()
            //     }], { session });
  
            //     break;
            //   }

            case "payment.captured": {
                // Check for existing verification first (outside transaction)
                const existingVerification = await PaymentVerification.findOne({
                  razorpayOrderId: event.order_id,
                });
              
                if (existingVerification) {
                  await session.abortTransaction();
                  session.endSession();
                  return {
                    success: true,
                    message: "Payment already processed",
                  };
                }
              
                // Find the order
                const order = await Order.findOne({
                  razorpayOrderId: event.order_id,
                }).session(session);
              
                if (!order) {
                  throw new Error(`Order not found for order_id: ${event.order_id}`);
                }
              
                // Check if user already has any of these mock tests
                const user = await User.findOne({
                  _id: new mongoose.Types.ObjectId(order.userId),
                  mocktests: { 
                    $in: order.mockTestIds.map(id => new mongoose.Types.ObjectId(id))
                  }
                });
              
                if (user) {
                  console.log(`User ${order.userId} already has some of these mock tests`);
                  await session.abortTransaction();
                  session.endSession();
                  return {
                    success: true,
                    message: "Some mock tests are already enrolled",
                  };
                }
              
                // Check if user is already enrolled in any of the mock test series
                const existingEnrollments = await MockTestSeries.findOne({
                  _id: { $in: order.mockTestIds.map(id => new mongoose.Types.ObjectId(id)) },
                  studentsEnrolled: new mongoose.Types.ObjectId(order.userId)
                });
              
                if (existingEnrollments) {
                  console.log(`User ${order.userId} already enrolled in some mock test series`);
                  await session.abortTransaction();
                  session.endSession();
                  return {
                    success: true,
                    message: "Already enrolled in some mock test series",
                  };
                }
              
                // Update MockTestSeries one by one to reduce write conflicts
                for (const mockTestId of order.mockTestIds) {
                  await MockTestSeries.updateOne(
                    {
                      _id: new mongoose.Types.ObjectId(mockTestId),
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
                }
              
                // Update user's mock tests
                await User.updateOne(
                  { _id: new mongoose.Types.ObjectId(order.userId) },
                  {
                    $addToSet: {
                      mocktests: {
                        $each: order.mockTestIds.map(
                          (id) => new mongoose.Types.ObjectId(id)
                        ),
                      },
                    },
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
              
                console.log(`Order processed successfully for user ${order.userId}`);
                break;
              }
  
              case "payment.failed": {
                await PaymentVerification.create(
                  [{
                    userId: event.notes.userId,
                    razorpayOrderId: event.order_id,
                    razorpayPaymentId: event.id,
                    status: "failed",
                    failureReason: event.error_description,
                    webhookProcessedAt: new Date(),
                  }],
                  { session }
                );
                break;
              }
  
              default:
                console.log(`Unhandled webhook event: ${req.body.event}`);
            }
  
            await session.commitTransaction();
            session.endSession();
            console.log("Transaction successful on attempt:", retryCount + 1);
            return {
              success: true,
              message: "Webhook processed successfully",
            };
          } catch (error) {
            await session.abortTransaction();
            session.endSession();
  
            // Check if error is a TransientTransactionError
            if (
              error.errorLabels?.includes('TransientTransactionError') &&
              retryCount < MAX_TRANSACTION_RETRIES - 1
            ) {
              console.log(`Transaction attempt ${retryCount + 1} failed, retrying...`);
              retryCount++;
              // Add a small delay before retrying
              await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount)));
              continue;
            }
            throw error;
          }
        }
        throw new Error('Max transaction retries exceeded');
      };
  
      // Execute the transaction with retry logic
      const result = await processTransactionWithRetry();
      return res.status(200).json(result);
  
    } catch (error) {
      console.error("Webhook processing error:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing webhook",
        error: error.message,
      });
    }
  };

async function sendPaymentSuccessEmail(userId, orderId, paymentId, amount) {
  try {
    const user = await User.findById(userId);
    await mailSender(
      user.email,
      "Payment Successful - Mock Test Series",
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
    console.error("Error sending success email:", error);
    throw error;
  }
}

// Helper function to send failure email
async function sendPaymentFailureEmail(userId, orderId, errorDescription) {
  try {
    const user = await User.findById(userId);
    await mailSender(
      user.email,
      "Payment Failed - Mock Test Series",
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
    console.error("Error sending failure email:", error);
    throw error;
  }
}

// Verify the payment for mock tests
// exports.verifyMockTestPayment = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId } = req.body;
//     const userId = req.user.id;
//     console.log("body receivced ==>", req.body)

//     try {
//         if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !itemId || !userId) {
//             return res.status(400).json({ success: false, message: "Payment verification failed. Missing required data." });
//         }

//         // Check if this payment was already verified
//         const existingVerification = await PaymentVerification.findOne({ razorpayOrderId: razorpay_order_id });
//         if (existingVerification) {
//             return res.status(201).json({ success: true, message: "Payment already verified" });
//         }
//         console.log("payment already done ==>", existingVerification);

//         let body = razorpay_order_id + "|" + razorpay_payment_id;
//         const expectedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_SECRET)
//             .update(body.toString())
//             .digest("hex");
//         console.log("signature ==>", expectedSignature)
//         if (expectedSignature !== razorpay_signature) {
//             return res.status(400).json({ success: false, message: "Payment signature verification failed." });
//         }

//         const mockTestIds = Array.isArray(itemId) ? itemId : [itemId];
//         console.log("moke test id ==>", mockTestIds);

//         // Update MockTestSeries and User in a single operation
//         const updateResult = await MockTestSeries.updateMany(
//             {
//                 _id: { $in: mockTestIds.map(id => new mongoose.Types.ObjectId(id)) },
//                 studentsEnrolled: { $ne: new mongoose.Types.ObjectId(userId) }
//             },
//             {
//                 $addToSet: { studentsEnrolled: new mongoose.Types.ObjectId(userId) }
//             },
//             { session }
//         );

//         // if (updateResult.modifiedCount !== mockTestIds.length) {
//         //     throw new Error("Failed to update all mock test series");
//         // }
//         console.log("updated resuilt ==>", updateResult)
//         await User.updateOne(
//             { _id: new mongoose.Types.ObjectId(userId) },
//             { $addToSet: { mocktests: { $each: mockTestIds.map(id => new mongoose.Types.ObjectId(id)) } } },
//             { session }
//         );

//         await PaymentVerification.create([{
//             userId,
//             razorpayOrderId: razorpay_order_id,
//             razorpayPaymentId: razorpay_payment_id,
//             mockTestIds
//         }], { session });
//         console.log("verification create ==>", PaymentVerification);
//         await session.commitTransaction();

//         // // Send email asynchronously
//         // const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
//         // sendMockTestPaymentSuccessEmail(userId, razorpay_order_id, razorpay_payment_id, order.amount).catch(console.error);

//         return res.status(200).json({ success: true, message: "Payment verified and access granted successfully." });
//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Error in verifyMockTestPayment:", error);
//         return res.status(500).json({ success: false, message: "Internal server error during payment verification." });
//     } finally {
//         session.endSession();
//     }
// };
