const mongoose = require('mongoose');

const paymentVerificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    razorpayOrderId: {
        type: String,
        required: true,
        unique: true
    },
    razorpayPaymentId: {
        type: String,
        required: true,
        unique: true
    },
    mockTestIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MockTestSeries',
        default: []  // Added default empty array for failed payments
    }],
    amount: {
        type: Number,
        required: false  // Optional since failed payments might not have amount
    },
    status: {
        type: String,
        required: true,
        enum: ['completed', 'failed'],
        default: 'completed'
    },
    paymentMethod: {
        type: String,
        required: false  // Optional since failed payments might not have method
    },
    failureReason: {
        type: String,
        required: false
    },
    webhookProcessedAt: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true  // Adds updatedAt and createdAt fields automatically
});

// Index for faster queries
paymentVerificationSchema.index({ razorpayOrderId: 1 });
paymentVerificationSchema.index({ razorpayPaymentId: 1 });
paymentVerificationSchema.index({ userId: 1 });
paymentVerificationSchema.index({ status: 1 });

const PaymentVerification = mongoose.model('PaymentVerification', paymentVerificationSchema);

module.exports = PaymentVerification;