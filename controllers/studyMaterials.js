const StudyMaterial = require('../models/stydyMaterials');

exports.createStudyMaterial = async (req, res) => {
  try {
    const studyMaterial = new StudyMaterial({
      ...req.body,
      createdBy: req.user.id
    });
    console.log(studyMaterial)
    await studyMaterial.save();
    res.status(201).send(studyMaterial);
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.getStudyMaterials = async (req, res) => {
  try {
    const studyMaterials = await StudyMaterial.find({ exam: req.params.examId })
      .populate('exam', 'name')
      .populate('createdBy', 'username');
    res.send(studyMaterials);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.getAllStudyMaterials = async (req, res) => {
    try {
      const studyMaterials = await StudyMaterial.find()
        .populate('exam', 'name')
        .populate('createdBy', 'username');
      res.send(studyMaterials);
    } catch (error) {
      res.status(500).send(error);
    }
  };
  

  exports.deleteStudyMaterial = async (req, res) => {
    try {
      const studyMaterialId = req.params.id;
      console.log(studyMaterialId)
      const deletedStudyMaterial = await StudyMaterial.findByIdAndDelete(studyMaterialId);
  
      if (!deletedStudyMaterial) {
        return res.status(404).send({ message: 'Study material not found' });
      }
  
      res.send({ message: 'Study material deleted successfully' });
    } catch (error) {
      res.status(500).send(error);
    }
  };