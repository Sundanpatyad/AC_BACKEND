const express = require('express');
const router = express.Router();
const {auth} = require('../middleware/auth');
const { createExam, getExams, deleteExam } = require('../controllers/examController');
const { createStudyMaterial, getStudyMaterials, getAllStudyMaterials, deleteStudyMaterial } = require('../controllers/studyMaterials');

router.post('/createExam',  createExam);
router.get('/getExam',  getExams);
router.delete('/deleteExam/:id',  deleteExam);

router.post('/createStudyMaterial',auth,createStudyMaterial);
router.get('/getStudyMaterials/:examId',auth ,getStudyMaterials);
router.get('/getAllStudyMaterials',getAllStudyMaterials);
router.delete('/deleteStudyMaterial/:id',deleteStudyMaterial);

module.exports = router;