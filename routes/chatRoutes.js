// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { auth } = require('../middleware/auth');

router.use(auth); 
router.post('/chat/create', (req, res) => chatController.createChat(req, res));
router.get('/chat/userChats', (req, res) => chatController.getChatsForUser(req, res));
router.get('/chat/:targetUserId', (req, res) => chatController.getChat(req, res));
router.post('/chat/message/:chatId', (req, res) => chatController.sendMessage(req, res));
router.get('/chat/:chatId/history', (req, res) => chatController.getChatHistory(req, res));
router.get('/chats', (req, res) => chatController.getAllChats(req, res));
router.get('/search', (req, res) => chatController.searchUsers(req, res));

module.exports = router;