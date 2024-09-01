const Exam = require('../models/examModal');

exports.createExam = async (req, res) => {
  try {
    const exam = new Exam(req.body);
    await exam.save();
    res.status(201).send(exam);
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.getExams = async (req, res) => {
  try {
    const exams = await Exam.find();
    res.send(exams);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.deleteExam = async (req, res) => {
    try {
      const examId = req.params.id;
      const deletedExam = await Exam.findByIdAndDelete(examId);
  
      if (!deletedExam) {
        return res.status(404).send({ message: 'Exam not found' });
      }
  
      res.send({ message: 'Exam deleted successfully' });
    } catch (error) {
      res.status(500).send(error);
    }
  };
  