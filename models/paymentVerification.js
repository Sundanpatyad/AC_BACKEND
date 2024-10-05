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
        required: true
    }],
    verifiedAt: {
        type: Date,
        default: Date.now
    }
});

const PaymentVerification = mongoose.model('PaymentVerification', paymentVerificationSchema);

module.exports = PaymentVerification;