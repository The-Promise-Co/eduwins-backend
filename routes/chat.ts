import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  listConversations,
  getConversationMessages,
  sendRequest,
  acceptRequest,
  declineRequest,
  markConversationRead,
  lookupUserByEmail,
} from '../controllers/chatController';

const router = express.Router();

router.get('/conversations', authenticateToken, listConversations as any);
router.get('/conversations/:conversationId/messages', authenticateToken, getConversationMessages as any);
router.post('/conversations/request', authenticateToken, sendRequest as any);
router.patch('/conversations/:conversationId/accept', authenticateToken, acceptRequest as any);
router.patch('/conversations/:conversationId/decline', authenticateToken, declineRequest as any);
router.patch('/conversations/:conversationId/read', authenticateToken, markConversationRead as any);
router.get('/users/lookup', authenticateToken, lookupUserByEmail as any);

export default router;
