import { Request, Response } from 'express';
import logger from '../utils/logger';
import {
  getConversations,
  getMessages,
  sendConversationRequest,
  acceptConversation,
  declineConversation,
  markAsRead,
  lookupByEmail,
} from '../services/chat';

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

// ── List conversations ───────────────────────────────────────────
export const listConversations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conversations = await getConversations(req.user.id);
    res.status(200).json({ conversations });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id }, 'chat.list_conversations_failed');
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

// ── Get messages for a conversation ──────────────────────────────
export const getConversationMessages = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { before, limit } = req.query;

    const messages = await getMessages(
      conversationId,
      req.user.id,
      before as string | undefined,
      limit ? parseInt(limit as string, 10) : 50
    );

    res.status(200).json({ messages });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id, conversationId: req.params.conversationId }, 'chat.get_messages_failed');
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// ── Send conversation request ────────────────────────────────────
export const sendRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const result = await sendConversationRequest(req.user.id, email);

    if ('error' in result) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ conversation: result.conversation });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id }, 'chat.send_request_failed');
    res.status(500).json({ error: 'Failed to send chat request' });
  }
};

// ── Accept conversation request ──────────────────────────────────
export const acceptRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const result = await acceptConversation(conversationId, req.user.id);

    if ('error' in result) {
      return res.status(400).json({ error: result.error });
    }

    res.status(200).json({ message: 'Chat request accepted' });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id, conversationId: req.params.conversationId }, 'chat.accept_failed');
    res.status(500).json({ error: 'Failed to accept chat request' });
  }
};

// ── Decline conversation request ─────────────────────────────────
export const declineRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const result = await declineConversation(conversationId, req.user.id);

    if ('error' in result) {
      return res.status(400).json({ error: result.error });
    }

    res.status(200).json({ message: 'Chat request declined' });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id, conversationId: req.params.conversationId }, 'chat.decline_failed');
    res.status(500).json({ error: 'Failed to decline chat request' });
  }
};

// ── Mark conversation as read ────────────────────────────────────
export const markConversationRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    await markAsRead(conversationId, req.user.id);
    res.status(200).json({ message: 'Conversation marked as read' });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id, conversationId: req.params.conversationId }, 'chat.mark_read_failed');
    res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
};

// ── Lookup user by email ─────────────────────────────────────────
export const lookupUserByEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || !(email as string).includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const user = await lookupByEmail(email as string);

    if (!user) {
      return res.status(404).json({ error: 'No user found with that email' });
    }

    res.status(200).json({ user });
  } catch (err: any) {
    logger.error({ err, userId: req.user.id }, 'chat.lookup_email_failed');
    res.status(500).json({ error: 'Failed to look up user' });
  }
};
