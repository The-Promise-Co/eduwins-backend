import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db } from '../database/db';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';
import { getConversations, sendMessage, markAsRead, getConversationParticipantIds } from '../services/chat';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

let io: Server;

// userId → Set of socketIds (supports multiple tabs/devices)
const connectedUsers = new Map<string, Set<string>>();

export function getIO(): Server {
  return io;
}

export function getConnectedUsers(): Map<string, Set<string>> {
  return connectedUsers;
}

export function isUserOnline(userId: string): boolean {
  const sockets = connectedUsers.get(userId);
  return !!sockets && sockets.size > 0;
}

export function initSocket(httpServer: HttpServer): Server {
  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // ── Auth middleware ────────────────────────────────────────────
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
      const user = await db.query.users.findFirst({
        where: eq(users.id, decoded.id),
      });

      if (!user) return next(new Error('User not found'));

      socket.data.userId = user.id;
      socket.data.userRole = user.role;
      next();
    } catch (err: any) {
      logger.error({ err }, 'socket.auth_failed');
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    logger.info({ userId, socketId: socket.id }, 'socket.connected');

    // Track this socket
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId)!.add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Notify others this user is online
    socket.broadcast.emit('chat:user_online', { userId });

    // ── Join conversation room ───────────────────────────────────
    socket.on('chat:join', (data: { conversationId: string }) => {
      socket.join(`conversation:${data.conversationId}`);
      logger.debug({ userId, conversationId: data.conversationId }, 'socket.joined_conversation');
    });

    // ── Leave conversation room ──────────────────────────────────
    socket.on('chat:leave', (data: { conversationId: string }) => {
      socket.leave(`conversation:${data.conversationId}`);
      logger.debug({ userId, conversationId: data.conversationId }, 'socket.left_conversation');
    });

    // ── Send message ─────────────────────────────────────────────
    socket.on('chat:send_message', async (data: {
      conversationId: string;
      content: string;
      type?: string;
      attachmentUrl?: string;
    }) => {
      try {
        const { conversationId, content, type = 'text', attachmentUrl } = data;
        if (!content?.trim() && type === 'text') return;

        // Content filter
        let flagged = false;
        let flaggedReason: string | undefined;
        const phoneRegex = /(0[789][01]\d{8})|(\+234[789][01]\d{8})/g;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const triggerWords = /\b(whatsapp|call me|text me|my number|081|080|090|070)\b/i;

        if (phoneRegex.test(content) || emailRegex.test(content) || triggerWords.test(content)) {
          flagged = true;
          flaggedReason = 'Contact details detected';
        }

        const message = await sendMessage({
          conversationId,
          senderId: userId,
          content,
          type: type as 'text' | 'image' | 'file',
          attachmentUrl,
          flagged,
          flaggedReason,
        });

        // Broadcast to conversation room
        if (!message) return;
        io.to(`conversation:${conversationId}`).emit('chat:new_message', {
          message,
          conversation: { id: conversationId },
        });

        // Fallback: also notify each participant's personal room (auto-joined
        // on every connect), so delivery survives lost conversation-room
        // membership and reaches recipients viewing the list/other chats.
        try {
          const participantIds = await getConversationParticipantIds(conversationId);
          for (const pid of participantIds) {
            if (pid !== userId) {
              io.to(`user:${pid}`).emit('chat:new_message', {
                message,
                conversation: { id: conversationId },
              });
            }
          }
        } catch (emitErr: any) {
          logger.warn({ err: emitErr, conversationId }, 'socket.user_room_emit_failed');
        }
      } catch (err: any) {
        logger.error({ err, userId, conversationId: data.conversationId }, 'socket.send_message_failed');
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    // ── Typing indicators ────────────────────────────────────────
    socket.on('chat:typing_start', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('chat:typing', {
        conversationId: data.conversationId,
        userId,
        isTyping: true,
      });
    });

    socket.on('chat:typing_stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('chat:typing', {
        conversationId: data.conversationId,
        userId,
        isTyping: false,
      });
    });

    // ── Mark as read ─────────────────────────────────────────────
    socket.on('chat:message_read', async (data: { conversationId: string }) => {
      try {
        const readAt = await markAsRead(data.conversationId, userId);
        socket.to(`conversation:${data.conversationId}`).emit('chat:messages_read', {
          conversationId: data.conversationId,
          userId,
          readAt,
        });
      } catch (err: any) {
        logger.error({ err, userId, conversationId: data.conversationId }, 'socket.mark_read_failed');
      }
    });

    // ── Disconnect ───────────────────────────────────────────────
    socket.on('disconnect', () => {
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          connectedUsers.delete(userId);
          // Notify others this user is offline
          io.emit('chat:user_offline', { userId });
        }
      }
      logger.info({ userId, socketId: socket.id }, 'socket.disconnected');
    });
  });

  return io;
}
