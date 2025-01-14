const mongoose = require('mongoose')

const studyMaterialSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  });


module.exports  = mongoose.model('StudyMaterial', studyMaterialSchema)