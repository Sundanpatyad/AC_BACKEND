const mongoose = require('mongoose');

const recoveryQueueSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    paymentId: {
        type: String,
        required: true
    },
    itemId: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'MockTestSeries',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed'],
        default: 'pending'
    },
    retryCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    },
    failedAt: {
        type: Date
    }
});

const RecoveryQueue = mongoose.model('RecoveryQueue', recoveryQueueSchema);

module.exports = RecoveryQueue;