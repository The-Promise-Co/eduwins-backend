import { eq, and, desc, sql, gt, lt, ne } from 'drizzle-orm';
import { db } from '../database/db';
import {
  conversations,
  conversationParticipants,
  messages,
  messageReadReceipts,
  users,
} from '../database/schema';

const createId = () => Math.random().toString(36).slice(2, 15);

// ── Get conversations for a user ─────────────────────────────────
export async function getConversations(userId: string) {
  const participations = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.userId, userId),
  });

  if (participations.length === 0) return [];

  const conversationIds = participations.map((p) => p.conversationId);

  const convList = await Promise.all(
    conversationIds.map(async (convId) => {
      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, convId),
      });
      if (!conv) return null;

      const participants = await db.query.conversationParticipants.findMany({
        where: eq(conversationParticipants.conversationId, convId),
      });

      const participantUsers = await Promise.all(
        participants.map(async (p) => {
          const user = await db.query.users.findFirst({
            where: eq(users.id, p.userId),
          });
          return {
            id: p.userId,
            firstName: user?.firstName,
            lastName: user?.lastName,
            photoUrl: user?.photoUrl,
            role: user?.role,
            lastReadAt: p.lastReadAt,
          };
        })
      );

      // Get last message (only for accepted conversations)
      let lastMessage = null;
      if (conv.status === 'accepted') {
        lastMessage = await db.query.messages.findFirst({
          where: eq(messages.conversationId, convId),
          orderBy: [desc(messages.createdAt)],
        });
      }

      // Count unread messages
      const participation = participations.find((p) => p.conversationId === convId);
      const lastReadAt = participation?.lastReadAt;

      let unreadCount = 0;
      if (conv.status === 'accepted') {
        if (lastReadAt) {
          const unreadRows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, convId),
                ne(messages.senderId, userId),
                gt(messages.createdAt, lastReadAt)
              )
            );
          unreadCount = unreadRows[0]?.count ?? 0;
        } else {
          const unreadRows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, convId),
                ne(messages.senderId, userId)
              )
            );
          unreadCount = unreadRows[0]?.count ?? 0;
        }
      }

      return {
        ...conv,
        participants: participantUsers,
        lastMessage: lastMessage || null,
        unreadCount,
      };
    })
  );

  return convList
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a?.lastMessage?.createdAt?.getTime() ?? a?.createdAt?.getTime() ?? 0;
      const bTime = b?.lastMessage?.createdAt?.getTime() ?? b?.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });
}

// ── Get messages for a conversation ──────────────────────────────
export async function getMessages(conversationId: string, userId: string, before?: string, limit = 50) {
  // Only allow messages for accepted conversations
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conv || conv.status !== 'accepted') {
    return [];
  }

  // Ensure user is a participant
  const participant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ),
  });
  if (!participant) return [];

  const conditions = [eq(messages.conversationId, conversationId)];

  if (before) {
    const beforeMessage = await db.query.messages.findFirst({
      where: eq(messages.id, before),
    });
    if (beforeMessage?.createdAt) {
      conditions.push(lt(messages.createdAt, beforeMessage.createdAt));
    }
  }

  const rows = await db.query.messages.findMany({
    where: and(...conditions),
    orderBy: [desc(messages.createdAt)],
    limit,
  });

  const result = await Promise.all(
    rows.map(async (msg) => {
      const sender = await db.query.users.findFirst({
        where: eq(users.id, msg.senderId),
      });
      return {
        ...msg,
        sender: {
          id: sender?.id,
          firstName: sender?.firstName,
          lastName: sender?.lastName,
          photoUrl: sender?.photoUrl,
        },
      };
    })
  );

  return result.reverse();
}

// ── Lookup user by email ─────────────────────────────────────────
export async function lookupByEmail(email: string) {
  if (!email || !email.includes('@')) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
  });

  if (!user) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    photoUrl: user.photoUrl,
    role: user.role,
  };
}

// ── Send conversation request ────────────────────────────────────
export async function sendConversationRequest(senderId: string, recipientEmail: string) {
  // Look up recipient by email
  const recipient = await db.query.users.findFirst({
    where: eq(users.email, recipientEmail.toLowerCase().trim()),
  });

  if (!recipient) {
    return { error: 'No user found with that email' };
  }

  if (recipient.id === senderId) {
    return { error: 'Cannot send a chat request to yourself' };
  }

  // Check if a direct conversation already exists between these two users
  const senderParticipations = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.userId, senderId),
  });

  for (const sp of senderParticipations) {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, sp.conversationId),
    });
    if (conv?.type !== 'direct') continue;

    const recipientParticipation = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, sp.conversationId),
        eq(conversationParticipants.userId, recipient.id)
      ),
    });

    if (recipientParticipation) {
      // Conversation already exists — return it
      const participants = await db.query.conversationParticipants.findMany({
        where: eq(conversationParticipants.conversationId, conv!.id),
      });

      const participantUsers = await Promise.all(
        participants.map(async (p) => {
          const u = await db.query.users.findFirst({
            where: eq(users.id, p.userId),
          });
          return {
            id: p.userId,
            firstName: u?.firstName,
            lastName: u?.lastName,
            photoUrl: u?.photoUrl,
            role: u?.role,
          };
        })
      );

      return { conversation: { ...conv, participants: participantUsers } };
    }
  }

  // Create new pending conversation
  const convId = createId();

  const [conv] = await db.insert(conversations).values({
    id: convId,
    type: 'direct',
    status: 'pending',
  }).returning();

  await db.insert(conversationParticipants).values([
    { id: createId(), conversationId: convId, userId: senderId },
    { id: createId(), conversationId: convId, userId: recipient.id },
  ]);

  const participants = [
    {
      id: senderId,
      firstName: undefined as string | undefined,
      lastName: undefined as string | undefined,
      photoUrl: undefined as string | null | undefined,
      role: undefined as string | undefined,
    },
    {
      id: recipient.id,
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      photoUrl: recipient.photoUrl,
      role: recipient.role,
    },
  ];

  // Fill in sender info
  const sender = await db.query.users.findFirst({
    where: eq(users.id, senderId),
  });
  if (sender) {
    participants[0].firstName = sender.firstName;
    participants[0].lastName = sender.lastName;
    participants[0].photoUrl = sender.photoUrl;
    participants[0].role = sender.role;
  }

  return { conversation: { ...conv, participants } };
}

// ── Accept conversation request ──────────────────────────────────
export async function acceptConversation(conversationId: string, userId: string) {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!conv) return { error: 'Conversation not found' };
  if (conv.status !== 'pending') return { error: 'Conversation is not pending' };

  // Ensure user is a participant
  const participant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ),
  });
  if (!participant) return { error: 'Not a participant' };

  await db
    .update(conversations)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  return { success: true };
}

// ── Decline conversation request ─────────────────────────────────
export async function declineConversation(conversationId: string, userId: string) {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!conv) return { error: 'Conversation not found' };
  if (conv.status !== 'pending') return { error: 'Conversation is not pending' };

  const participant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ),
  });
  if (!participant) return { error: 'Not a participant' };

  await db
    .update(conversations)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  return { success: true };
}

// ── Send a message (accepted conversations only) ─────────────────
export async function sendMessage({
  conversationId,
  senderId,
  content,
  type = 'text',
  attachmentUrl,
  flagged = false,
  flaggedReason,
}: {
  conversationId: string;
  senderId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  attachmentUrl?: string;
  flagged?: boolean;
  flaggedReason?: string;
}) {
  // Only allow messages in accepted conversations
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conv || conv.status !== 'accepted') {
    return null;
  }

  const msgId = createId();

  const [msg] = await db.insert(messages).values({
    id: msgId,
    conversationId,
    senderId,
    content,
    type,
    attachmentUrl: attachmentUrl || null,
    flagged,
    flaggedReason: flaggedReason || null,
  }).returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const sender = await db.query.users.findFirst({
    where: eq(users.id, senderId),
  });

  return {
    ...msg,
    sender: {
      id: sender?.id,
      firstName: sender?.firstName,
      lastName: sender?.lastName,
      photoUrl: sender?.photoUrl,
    },
  };
}

// ── Mark conversation as read ────────────────────────────────────
export async function markAsRead(conversationId: string, userId: string): Promise<Date> {
  const now = new Date();

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    );

  const unreadMsgs = await db.query.messages.findMany({
    where: and(
      eq(messages.conversationId, conversationId),
      ne(messages.senderId, userId)
    ),
  });

  for (const msg of unreadMsgs) {
    const existing = await db.query.messageReadReceipts.findFirst({
      where: and(
        eq(messageReadReceipts.messageId, msg.id),
        eq(messageReadReceipts.userId, userId)
      ),
    });

    if (!existing) {
      await db.insert(messageReadReceipts).values({
        id: createId(),
        messageId: msg.id,
        userId,
        readAt: now,
      });
    }
  }

  return now;
}

// ── Participant ids for a conversation ─────────────────────────────
export async function getConversationParticipantIds(conversationId: string): Promise<string[]> {
  const parts = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.conversationId, conversationId),
  });
  return parts.map((p) => p.userId);
}
