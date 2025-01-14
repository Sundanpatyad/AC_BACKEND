const express = require('express');
const router = express.Router();

const { capturePayment, verifyPayment } = require('../controllers/payments');
const { auth, isAdmin, isInstructor, isStudent } = require('../middleware/auth');
const { captureMockTestPayment, handleRazorpayWebhook } = require('../controllers/mocktestPaymet');
const mockTestPurchasersController = require('../controllers/paymentList');


router.post('/capturePayment', auth, isStudent, capturePayment);
router.post('/captureMockPaymet', auth, isStudent,captureMockTestPayment );
router.post('/webhook', handleRazorpayWebhook)
// router.post('/verifyPayment', auth, isStudent, verifyPayment);
// router.post('/verifyMockPayment', auth, isStudent, verifyMockTestPayment);
router.get('/listPayment', auth, mockTestPurchasersController.listPurchasers);
// router.get('/getFailedPayments', getIncompletePaymentUsers);


module.exports = router
