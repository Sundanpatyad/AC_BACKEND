const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String
  });
  
module.exports = mongoose.model('Exam', examSchema);