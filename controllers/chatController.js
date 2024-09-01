const Chat = require('../models/chatSchema');
const User = require('../models/user')
const mongoose = require('mongoose');



exports.createChat = async (req, res) => {
    try {
      const { targetUserEmail } = req.body;
      const currentUserEmail = req.user.email; // Assuming email is stored in the user object after authentication
  
      // Check if users exist
      const currentUser = await User.findOne({ email: currentUserEmail });
      const targetUser = await User.findOne({ email: targetUserEmail });
  
      if (!currentUser || !targetUser) {
        return res.status(404).json({ error: 'One or both users not found' });
      }
  
      // Check if a chat already exists between these users
      let existingChat = await Chat.findOne({
        $or: [
          { user: currentUser._id, instructor: targetUser._id },
          { user: targetUser._id, instructor: currentUser._id }
        ]
      });
  
      if (existingChat) {
        return res.status(400).json({ error: 'Chat already exists', chatId: existingChat._id });
      }
  
      // Determine who is the instructor and who is the user
      let userRole, instructorRole;
      if (currentUser.accountType === 'Instructor') {
        instructorRole = currentUser._id;
        userRole = targetUser._id;
      } else {
        instructorRole = targetUser._id;
        userRole = currentUser._id;
      }
  
      // Create a new chat
      const newChat = new Chat({
        user: userRole,
        instructor: instructorRole,
        messages: []
      });
  
      await newChat.save();
  
      // Populate user and instructor details
      const populatedChat = await Chat.findById(newChat._id)
        .populate('user', 'firstName lastName email')
        .populate('instructor', 'firstName lastName email');
  
      res.status(201).json(populatedChat);
    } catch (error) {
      console.error('Error creating chat:', error);
      res.status(500).json({ error: 'Error creating chat' });
    }
  };

exports.getChat = async (req, res) => {
    try {
      // Check if req.user is available
      if (!req.user) {
        return res.status(400).json({ error: 'User not authenticated' });
      }
  
      const loggedInUserId =req.user.id
  
      // Check if targetUserId is provided in the request params
      const targetUserId = req.params.targetUserId;
      if (!targetUserId) {
        return res.status(400).json({ error: 'Target user ID is required' });
      }
      const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);
      
      let chat = await Chat.findOne({
        $or: [
          { user: loggedInUserId, instructor: targetUserId },
          { user: targetUserId, instructor: loggedInUserId }
        ]
      }).populate('user instructor', 'firstName lastName accountType');
  
      if (!chat) {
        chat = new Chat({
          user: req.user.accountType === 'Student' ? loggedInUserId : targetUserObjectId,
          instructor: req.user.accountType === 'Instructor' ? loggedInUserId : targetUserObjectId,
          messages: []
        });
  
        
        
        chat = await Chat.findById(chat._id).populate('user instructor', 'firstName lastName accountType');
      }
  
      res.status(200).json(chat);
    } catch (error) {
      console.error('Error fetching chat:', error);
      res.status(500).json({ error: 'Error fetching chat' });
    }
  };
  
exports.getChatsForUser = async (req, res) => {
    try {
      // Access the logged-in user's ID from the request object
      const userId = req.user.id;
      console.log(req.user)
      // Find chats where the logged-in user is either the user or the instructor
      const chats = await Chat.find({
        $or: [
          { user: userId },
          { instructor: userId }
        ]
      }).populate('user instructor messages.sender', 'name email') // Optional: populate fields for better readability
        .exec();
  
      // Return the chats data
      res.status(200).json(chats);
    } catch (error) {
      // Handle errors
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  };

exports.sendMessage = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const senderId = req.user.id;
    const { content, attachmentName, attachmentLink } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const message = {
      sender: senderId,
      content,
      attachments: attachmentLink ? [{ name: attachmentName, link: attachmentLink }] : []
    };

    chat.messages.push(message);
    chat.lastUpdated = Date.now();
    await chat.save();

    const populatedChat = await Chat.findById(chatId).populate('messages.sender', 'firstName lastName');
    res.status(200).json(populatedChat);
  } catch (error) {
    res.status(500).json({ error: 'Error sending message' });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    const chatId = req.params.chatId;

    const chat = await Chat.findById(chatId).populate('messages.sender', 'firstName lastName');
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chat history' });
  }
};

exports.getAllChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userType = req.user.accountType;

    let chats;
    if (userType === 'Instructor') {
      chats = await Chat.find({ instructor: userId })
        .populate('user', 'firstName lastName')
        .sort({ lastUpdated: -1 });
    } else {
      chats = await Chat.find({ user: userId })
        .populate('instructor', 'firstName lastName')
        .sort({ lastUpdated: -1 });
    }

    if (!chats || chats.length === 0) return res.status(404).json({ error: 'No chats found' });

    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chats' });
  }
};
exports.searchUsers = async (req, res) => {
    try {
      const { query } = req.query;
  
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }
  
      // Create a case-insensitive regular expression for searching
      const searchRegex = new RegExp(query, 'i');
  
      // Aggregation pipeline
      const users = await User.aggregate([
        {
          $match: {
            $or: [
              { firstName: { $regex: searchRegex } },
              { lastName: { $regex: searchRegex } },
              { email: { $regex: searchRegex } }
            ]
          }
        },
        {
          $lookup: {
            from: 'profiles', // The name of the Profile collection
            localField: 'additionalDetails',
            foreignField: '_id',
            as: 'additionalDetails'
          }
        },
        {
          $lookup: {
            from: 'courses', // The name of the Course collection
            localField: 'courses',
            foreignField: '_id',
            as: 'courses'
          }
        },
        {
          $lookup: {
            from: 'mocktestseries', // The name of the MockTestSeries collection
            localField: 'mocktests',
            foreignField: '_id',
            as: 'mocktests'
          }
        },
        {
          $lookup: {
            from: 'attemptdetails', // The name of the AttemptDetails collection
            localField: 'attempts',
            foreignField: '_id',
            as: 'attempts'
          }
        },
        {
          $lookup: {
            from: 'courseprogresses', // The name of the CourseProgress collection
            localField: 'courseProgress',
            foreignField: '_id',
            as: 'courseProgress'
          }
        },
        {
          $project: {
            password: 0, // Exclude the password field
            token: 0,    // Exclude the token field
            resetPasswordExpires: 0 // Exclude the resetPasswordExpires field
          }
        }
      ]);
  
      if (users.length === 0) {
        return res.status(404).json({ message: 'No users found' });
      }
  
      return res.status(200).json(users);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
};

  
 
