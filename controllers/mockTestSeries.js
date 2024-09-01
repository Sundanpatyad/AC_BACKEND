const Mocktest = require("../models/mocktest");
const { MockTestSeries } = require("../models/mockTestSeries");

exports.createMockTestSeries = async (req, res) => {
    try {
        const { seriesName, description, price, mockTests, status } = req.body;
        const creator = req.user.id; 

        const newSeries = new MockTestSeries({
            seriesName,
            description,
            price,
            status,
            creator,
            totalTests: mockTests.length
        });

        const savedSeries = await newSeries.save();

        res.status(201).json({
            success: true,
            data: savedSeries
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getAllMockTestSeries = async (req, res) => {
    try {
        const series = await MockTestSeries.find().populate('creator', 'name email');
        res.status(200).json({
            success: true,
            data: series
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
exports.getAllMockTestSeriesStudent = async (req, res) => {
    try {
        const series = await MockTestSeries.find().populate('creator', 'name email');
        res.status(200).json({
            success: true,
            data: series
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMockTestSeriesById = async (req, res) => {
    try {
        const series = await MockTestSeries.findById(req.params.id)
            .populate('creator', 'name email')
            .populate('mockTests');
        
        if (!series) {
            return res.status(404).json({
                success: false,
                message: 'Mock test series not found'
            });
        }

        res.status(200).json({
            success: true,
            data: series
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateMockTestSeries = async (req, res) => {
    try {
      const { seriesName, description, price, status, mockTests, attachments } = req.body;
  
      // Find the existing series
      const existingSeries = await MockTestSeries.findById(req.params.id);
      if (!existingSeries) {
        return res.status(404).json({
          success: false,
          message: 'Mock test series not found'
        });
      }
  
      // Check if any changes were made
      const isChanged = 
        seriesName !== existingSeries.seriesName ||
        description !== existingSeries.description ||
        price !== existingSeries.price ||
        status !== existingSeries.status ||
        JSON.stringify(mockTests) !== JSON.stringify(existingSeries.mockTests) ||
        JSON.stringify(attachments) !== JSON.stringify(existingSeries.attachments);
  
      if (!isChanged) {
        // If no changes, return the existing series
        return res.status(200).json({
          success: true,
          data: existingSeries,
          message: 'No changes detected'
        });
      }
  
      // Update the series
      const updatedSeries = await MockTestSeries.findByIdAndUpdate(
        req.params.id,
        {
          seriesName,
          description,
          price,
          status,
          mockTests,
          attachments,
          totalTests: mockTests.length + attachments.length
        },
        { new: true, runValidators: true }
      );
  
      res.status(200).json({
        success: true,
        data: updatedSeries,
        message: 'Mock test series updated successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };

exports.deleteMockTestSeries = async (req, res) => {
    try {
        const deletedSeries = await MockTestSeries.findByIdAndDelete(req.params.id);

        if (!deletedSeries) {
            return res.status(404).json({
                success: false,
                message: 'Mock test series not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Mock test series deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};