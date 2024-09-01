const express = require('express');
const router = express.Router();

const { createMockTests, getMockDetails, getMockTests, addMockTestToSeries, addAttachmentsToSeries } = require('../controllers/mockTest');
const { auth, isInstructor, isStudent } = require('../middleware/auth');
const { createMockTestSeries, getAllMockTestSeries, getAllMockTestSeriesStudent, getMockTestSeriesById, updateMockTestSeries } = require('../controllers/mockTestSeries');
const { createAttempt, getAttemptsByUser, getRankings } = require('../controllers/attemptDetails');

router.post('/createMockTest', auth, isInstructor, createMockTests);
router.get('/getMockTests', auth,isInstructor, getAllMockTestSeries);
router.get('/getMockTest', getAllMockTestSeriesStudent);
router.post('/createMockTestSeries', auth, isInstructor, createMockTestSeries);
router.get('/getMockTestSeriesById/:id',getMockTestSeriesById);
router.get('/getAttemptsByUser',auth , getAttemptsByUser);
router.post('/createAttemptDetails', auth , createAttempt);
router.get('/getRankings', auth , getRankings);
router.put('/updateMockTestSeries/:id', auth , updateMockTestSeries);
router.post('/addMocktestToSeries', auth , addMockTestToSeries);
router.post('/series/:seriesId/attachments', auth, addAttachmentsToSeries);

module.exports = router;