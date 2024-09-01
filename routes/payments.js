const express = require('express');
const router = express.Router();

const { capturePayment, verifyPayment } = require('../controllers/payments');
const { auth, isAdmin, isInstructor, isStudent } = require('../middleware/auth');
const { captureMockTestPayment, verifyMockTestPayment } = require('../controllers/mocktestPaymet');

router.post('/capturePayment', auth, isStudent, capturePayment);
router.post('/captureMockPaymet', auth, isStudent,captureMockTestPayment );
router.post('/verifyPayment', auth, isStudent, verifyPayment);
router.post('/verifyMockPayment', auth, isStudent, verifyMockTestPayment);

module.exports = router
