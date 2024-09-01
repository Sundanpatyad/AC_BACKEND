const express = require("express");
const router = express.Router();

const { auth, isInstructor } = require("../middleware/auth");

// controllers
const {
    updateProfile,
    updateUserProfileImage,
    getUserDetails,
    getEnrolledCourses,
    deleteAccount,
    instructorDashboard,
    getEnrolledMockTests
} = require('../controllers/profile');


// ********************************************************************************************************
//                                      Profile routes
// ********************************************************************************************************

// Delete User Account
router.delete('/deleteProfile', auth, deleteAccount);
router.put('/updateProfile', auth, updateProfile);
router.get('/getUserDetails', auth, getUserDetails);


// Get Enrolled Courses
router.get('/getEnrolledCourses', auth, getEnrolledCourses);
router.get('/getEnrolledMockTests', auth, getEnrolledMockTests);

// update profile image
router.put('/updateUserProfileImage', auth, updateUserProfileImage);

// instructor Dashboard Details
router.get('/instructorDashboard', auth, isInstructor, instructorDashboard);



module.exports = router;
