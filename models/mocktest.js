const mongoose = require('mongoose');

const MocktestSchema = new mongoose.Schema({
    testName: { type: String, required: true },
    questions: [{
        text: { type: String, required: true },
        options: [{ type: String, required: true }],
        correctAnswer: { type: String, required: true },
    }],
    duration: { type: Number, required: true },
    price: {
        type: Number
    },
    status: { type: String, enum: ['published', 'draft'], default: 'published' },
    studentsEnrolled: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }
    ],
}, {
    timestamps: true,
});

const Mocktest = mongoose.model('Mocktest', MocktestSchema);

module.exports = Mocktest
