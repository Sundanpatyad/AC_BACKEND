const express = require('express');
const router = express.Router();
const { getUsersByMockTest , getUsersWithoutAssignedMocks} = require('../controllers/AdminControllers');

router.get('/users-by-mock-test', getUsersByMockTest);
router.get('/getUsersWithoutAssignedMocks', getUsersWithoutAssignedMocks);

module.exports = router;