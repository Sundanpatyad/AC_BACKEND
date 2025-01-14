const mongoose = require('mongoose');

// Order Schema
const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mockTestIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MockTestSeries',
        required: true
    }],
    amount: {
        type: Number,
        required: true
    },
    razorpayOrderId: {
        type: String,
        required: true,
        unique: true
    },
    idempotencyKey: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['created', 'paid', 'failed'],
        default: 'created'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;