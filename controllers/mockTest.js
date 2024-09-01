const Course = require('../models/course');
const Mocktest = require('../models/mocktest');
const { MockTestSeries } = require('../models/mockTestSeries');
const Section = require('../models/section');

// ================ create Section ================
exports.createMockTests = async (req, res) => {
    try {
      // Extract data from request body
      const { testName, questions, duration, status, id } = req.body;
  
      // Basic validation for required fields
      if (!testName || !questions || !duration || !id) {
        return res.status(400).json({
          success: false,
          message: 'Test name, questions, duration, and series ID are required',
        });
      }
  
      // Validate the status field
      const validStatuses = ['published', 'draft'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be either "published" or "draft".',
        });
      }
  
      // Find the test series by ID
      const testSeries = await MockTestSeries.findById(id);
      if (!testSeries) {
        return res.status(404).json({
          success: false,
          message: 'Test series not found',
        });
      }
  
      // Create a new mock test object
      const newMockTest = {
        testName,
        questions,
        duration,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
  
      // Add the new mock test to the series
      testSeries.mockTests.push(newMockTest);
  
      // Save the updated test series to the database
      await testSeries.save();
  
      res.status(201).json({
        success: true,
        message: 'Mock test created and added to the series successfully',
        data: newMockTest,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error', // Generic error message for security
      });
    }
  };


  exports.getMockDetails = async (req, res) => {
    try {
      // Get mock ID from request parameters
      const mockId = req.params.id;
      //console.log(req.params);
  
      // Validate mock ID (assuming it's a valid object ID)
      if (!mockId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid mock ID provided',
        });
      }
  
      // Fetch mock details using findById with populate
      const mockDetails = await Mocktest.findById(mockId).populate('questions'); // Corrected to use `mockId` directly
  
      // Check if mock is found
      if (!mockDetails) {
        return res.status(404).json({
          success: false,
          message: `Mock test with ID ${mockId} not found`,
        });
      }
  
      // Send successful response with populated mock details
      res.status(200).json({
        success: true,
        data: mockDetails,
      });
    } catch (error) {
      console.error('Error while fetching mock details:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  exports.getMockTests = async (req, res) => {
    try {
      // Fetch all mock tests and populate the questions field
      const mockTests = await Mocktest.find().populate('questions'); 
  
      // Check if there are mock tests available
      if (!mockTests.length) {
        return res.status(404).json({
          success: false,
          message: 'No mock tests found',
        });
      }
  
      // Send successful response with populated mock tests
      res.status(200).json({
        success: true,
        data: mockTests,
      });
    } catch (error) {
      console.error('Error while fetching mock tests:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
  



exports.addMockTestToSeries = async (req, res) => {
  try {
    const { seriesId, testName, testData, duration } = req.body;

    const questions = parseTestData(testData);

    const updatedSeries = await MockTestSeries.findByIdAndUpdate(
      seriesId,
      {
        $push: {
          mockTests: {
            testName,
            questions,
            duration,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        },
        $inc: { totalTests: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!updatedSeries) {
      return res.status(404).json({ message: 'Mock Test Series not found' });
    }

    res.status(201).json({ message: 'Mock test added successfully', updatedSeries });
  } catch (error) {
    res.status(500).json({ message: 'Error adding mock test', error: error.message });
  }
}

function parseTestData(testData) {
  const lines = testData.split('\n').filter(line => line.trim() !== '');
  const questions = [];
  
  for (let i = 0; i < lines.length; i += 6) {
    if (i + 5 < lines.length) {
      questions.push({
        text: lines[i].trim(),
        options: [
          lines[i + 1].trim(),
          lines[i + 2].trim(),
          lines[i + 3].trim(),
          lines[i + 4].trim()
        ],
        correctAnswer: lines[i + 5].trim()
      });
    }
  }
  
  return questions;
}


exports.addAttachmentsToSeries = async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { questionPaper, answerKey, omrSheet , name} = req.body;

    // Validate input
    if (!seriesId) {
      return res.status(400).json({
        success: false,
        message: 'Series ID is required',
      });
    }

    // Find the mock test series
    const series = await MockTestSeries.findById(seriesId);
    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Mock test series not found',
      });
    }

    // Create the attachment object
    const newAttachment = {};
    if (questionPaper) newAttachment.questionPaper = questionPaper;
    if (answerKey) newAttachment.answerKey = answerKey;
    if (omrSheet) newAttachment.omrSheet = omrSheet;
    if (name) newAttachment.name = name;

    // Add the new attachment to the series
    series.attachments.push(newAttachment);

    // Save the updated series
    await series.save();

    res.status(200).json({
      success: true,
      message: 'Attachments added to the series successfully',
      data: series.attachments,
    });
  } catch (error) {
    console.error('Error adding attachments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};