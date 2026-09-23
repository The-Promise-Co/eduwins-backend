import { Request, Response } from 'express';
import { and, eq, desc, inArray } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { AccessToken } from 'livekit-server-sdk';
import { db } from '../database/db';
import { bookings, bookingChildren, children, users, sessionJoinCodes, sessionEvents, sessionNotes, whiteboardSnapshots } from '../database/schema';
import logger from '../utils/logger';
import { parseBookingDateTime } from '../utils/bookingTime';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const JOIN_WINDOW_MINUTES = 15;

const createId = () => Math.random().toString(36).slice(2, 15);

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const getBookingWithAccess = async (bookingId: string, userId: string) => {
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking) return { booking: null, error: 'Booking not found' as const, status: 404 as const };
  if (booking.teacherId !== userId && booking.parentId !== userId) {
    return { booking: null, error: 'Access denied' as const, status: 403 as const };
  }
  return { booking, error: null, status: 200 as const };
};

const validateTimingWindow = (booking: { scheduledDate?: string | null; startTime?: string | null; durationHours?: string | number | null }) => {
  if (!booking.scheduledDate || !booking.startTime) return { valid: false, error: 'Session schedule not set' };
  // Booking wall-clock is Africa/Lagos time — parse explicitly so the result
  // does not depend on the server's OS timezone.
  const start = parseBookingDateTime(booking.scheduledDate, booking.startTime);
  if (!start) return { valid: false, error: 'Session schedule not set' };
  const durationMs = Number(booking.durationHours || 1) * 60 * 60 * 1000;
  const end = new Date(start.getTime() + durationMs);
  const joinWindowOpen = new Date(start.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000);
  const now = new Date();
  return { valid: now >= joinWindowOpen && now < end, start, end, joinWindowOpen };
};

const createLiveKitToken = async (identity: string, room: string) => {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, ttl: '10m' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  return at.toJwt();
};

// POST /livekit/token — generate token for parent/teacher
export const getToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ error: 'booking_id is required' });

    const { booking, error, status } = await getBookingWithAccess(booking_id, req.user.id);
    if (!booking) return res.status(status).json({ error });

    if (booking.status !== 'paid_escrow') {
      return res.status(403).json({ error: 'Session is only available after payment is confirmed' });
    }

    const timing = validateTimingWindow(booking);
    if (!timing.valid) {
      return res.status(403).json({ error: 'Session is not available yet. You can join 15 minutes before the scheduled start time.' });
    }

    const identity = `${req.user.role}-${req.user.id}`;
    const token = await createLiveKitToken(identity, booking.id);

    // Ensure session room ID is set
    if (!booking.sessionRoomId) {
      await db.update(bookings).set({ sessionRoomId: booking.id, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    }

    res.status(200).json({ server_url: LIVEKIT_URL, participant_token: token });
  } catch (err: any) {
    logger.error({ err }, 'LiveKit token error');
    res.status(500).json({ error: 'Failed to generate session token' });
  }
};

// GET /livekit/join/:code — validate child code and return token
export const joinByCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ valid: false, error: 'Code is required' });

    const joinCode = await db.query.sessionJoinCodes.findFirst({
      where: eq(sessionJoinCodes.code, code.toUpperCase()),
    });

    if (!joinCode) return res.status(404).json({ valid: false, error: 'Invalid join code' });

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, joinCode.bookingId) });
    if (!booking) return res.status(404).json({ valid: false, error: 'Booking not found' });
    if (booking.status !== 'paid_escrow') {
      return res.status(403).json({ valid: false, error: 'Session is not available for this booking' });
    }

    const timing = validateTimingWindow(booking);
    if (!timing.valid) {
      return res.status(403).json({ valid: false, error: 'Session is not available yet' });
    }

    // Look up child info
    const child = await db.query.children.findFirst({ where: eq(children.id, joinCode.childId) });
    if (!child) return res.status(404).json({ valid: false, error: 'Child not found' });

    const childUser = await db.query.users.findFirst({ where: eq(users.id, child.userId) });
    const childName = childUser ? `${childUser.firstName || ''} ${childUser.lastName || ''}`.trim() || 'Child' : 'Child';

    // Look up teacher name
    const teacher = booking.teacherId ? await db.query.users.findFirst({ where: eq(users.id, booking.teacherId) }) : null;
    const teacherName = teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Tutor' : 'Tutor';

    const identity = `child-${child.id}-${booking.id}`;
    const token = await createLiveKitToken(identity, booking.id);

    res.status(200).json({
      valid: true,
      bookingId: booking.id,
      childId: child.id,
      childName,
      subject: booking.subject,
      teacherName,
      serverUrl: LIVEKIT_URL,
      participantToken: token,
    });
  } catch (err: any) {
    logger.error({ err }, 'LiveKit join by code error');
    res.status(500).json({ valid: false, error: 'Failed to validate join code' });
  }
};

// GET /livekit/codes/:bookingId — list child codes for a booking
export const getChildCodes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { booking, error, status } = await getBookingWithAccess(bookingId, req.user.id);
    if (!booking) return res.status(status).json({ error });

    // Get linked children
    const linkedChildren = await db.select({
      childId: bookingChildren.childId,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(bookingChildren)
      .innerJoin(children, eq(bookingChildren.childId, children.id))
      .innerJoin(users, eq(children.userId, users.id))
      .where(eq(bookingChildren.bookingId, bookingId));

    // Get existing codes for this booking
    const existingCodes = await db.query.sessionJoinCodes.findMany({
      where: eq(sessionJoinCodes.bookingId, bookingId),
    });

    const codesByChildId = new Map(existingCodes.map((c) => [c.childId, c.code]));

    // Generate codes for children that don't have one yet
    const codes = await Promise.all(
      linkedChildren.map(async (child) => {
        let code = codesByChildId.get(child.childId);
        if (!code) {
          code = generateJoinCode();
          await db.insert(sessionJoinCodes).values({
            id: createId(),
            bookingId,
            childId: child.childId,
            code,
          });
        }
        return {
          childId: child.childId,
          childName: `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Child',
          code,
        };
      }),
    );

    res.status(200).json({ bookingId, codes });
  } catch (err: any) {
    logger.error({ err }, 'Get child codes error');
    res.status(500).json({ error: 'Failed to fetch child codes' });
  }
};

// POST /sessions/:bookingId/events — log session event
export const postSessionEvent = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { participantName, participantRole, childId, event } = req.body;

    if (!participantName || !participantRole || !event) {
      return res.status(400).json({ error: 'participantName, participantRole, and event are required' });
    }

    // Validate booking exists
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Generate identity for dedup (optional — for tracking unique participants)
    const participantIdentity = childId ? `child-${childId}-${bookingId}` : `${participantRole}-${req.body.userId || 'unknown'}`;

    const [result] = await db.insert(sessionEvents).values({
      id: createId(),
      bookingId,
      participantIdentity,
      participantName,
      participantRole,
      childId: childId || null,
      event,
      timestamp: new Date(),
    }).returning();

    res.status(201).json({ success: true, eventId: result.id });
  } catch (err: any) {
    logger.error({ err }, 'Post session event error');
    res.status(500).json({ error: 'Failed to log session event' });
  }
};

// GET /sessions/:bookingId/events — get session events
export const getSessionEvents = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;

    // Validate access
    const { booking, error, status } = await getBookingWithAccess(bookingId, req.user.id);
    if (!booking) return res.status(status).json({ error });

    const events = await db.query.sessionEvents.findMany({
      where: eq(sessionEvents.bookingId, bookingId),
      orderBy: [desc(sessionEvents.timestamp)],
      limit: 100,
    });

    res.status(200).json({ events });
  } catch (err: any) {
    logger.error({ err }, 'Get session events error');
    res.status(500).json({ error: 'Failed to fetch session events' });
  }
};

// POST /sessions/:bookingId/whiteboard/snapshots — save a user-created snapshot
// No auth middleware (children join by code without JWT), following the
// postSessionEvent precedent: booking existence is validated instead.
// The live board is never persisted — only explicit snapshots land here.
export const postWhiteboardSnapshot = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { id, title, scene, imageUrl, authorName, authorRole, createdBy, timestamp } = req.body;

    if (!scene || typeof scene !== 'string') {
      return res.status(400).json({ error: 'scene (Excalidraw scene JSON) is required' });
    }

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Idempotent on client-generated id: retried POSTs (after a timeout where
    // the first insert actually landed) return the existing row instead of a
    // PK-conflict 500.
    const snapshotId = id || createId();
    const inserted = await db.insert(whiteboardSnapshots).values({
      id: snapshotId,
      bookingId,
      createdBy: createdBy || null,
      title: title || `Board Snapshot`,
      scene,
      imageUrl: imageUrl || null,
      authorName: authorName || null,
      authorRole: authorRole || null,
    }).onConflictDoNothing().returning();
    const result = inserted[0] || await db.query.whiteboardSnapshots.findFirst({
      where: eq(whiteboardSnapshots.id, snapshotId),
    });
    if (!result) return res.status(500).json({ error: 'Failed to save whiteboard snapshot' });

    res.status(201).json({
      snapshot: {
        id: result.id,
        title: result.title,
        scene: result.scene,
        imageUrl: result.imageUrl,
        timestamp: timestamp || result.createdAt?.toISOString(),
        authorName: result.authorName,
        authorRole: result.authorRole,
        createdAt: result.createdAt?.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Post whiteboard snapshot error');
    res.status(500).json({ error: 'Failed to save whiteboard snapshot' });
  }
};

// POST /sessions/:bookingId/whiteboard/snapshots/batch — flush multiple pending snapshots
export const postWhiteboardSnapshotsBatch = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const list = Array.isArray(req.body?.snapshots) ? req.body.snapshots : null;
    if (!list || list.length === 0) {
      return res.status(400).json({ error: '`snapshots` must be a non-empty array' });
    }
    if (list.length > 50) {
      return res.status(400).json({ error: 'Too many snapshots in one batch (max 50)' });
    }

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const results: any[] = [];
    for (const item of list) {
      const { id, title, scene, imageUrl, authorName, authorRole, createdBy, timestamp } = item || {};
      if (!scene || typeof scene !== 'string') {
        return res.status(400).json({ error: 'Each snapshot requires a `scene` string' });
      }
      const snapshotId = id || createId();
      const inserted = await db.insert(whiteboardSnapshots).values({
        id: snapshotId,
        bookingId,
        createdBy: createdBy || null,
        title: title || 'Board Snapshot',
        scene,
        imageUrl: imageUrl || null,
        authorName: authorName || null,
        authorRole: authorRole || null,
      }).onConflictDoNothing().returning();
      const result = inserted[0] || await db.query.whiteboardSnapshots.findFirst({
        where: eq(whiteboardSnapshots.id, snapshotId),
      });
      if (result) {
        results.push({
          id: result.id,
          title: result.title,
          scene: result.scene,
          imageUrl: result.imageUrl,
          timestamp: timestamp || result.createdAt?.toISOString(),
          authorName: result.authorName,
          authorRole: result.authorRole,
          createdAt: result.createdAt?.toISOString(),
        });
      }
    }

    res.status(201).json({ saved: results.length, snapshots: results });
  } catch (err: any) {
    logger.error({ err }, 'Post whiteboard snapshots (batch) error');
    res.status(500).json({ error: 'Failed to save whiteboard snapshots' });
  }
};

// GET /sessions/:bookingId/whiteboard/snapshots — list snapshots for a booking
export const getWhiteboardSnapshots = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;

    const { booking, error, status } = await getBookingWithAccess(bookingId, req.user.id);
    if (!booking) return res.status(status).json({ error });

    const rows = await db.query.whiteboardSnapshots.findMany({
      where: eq(whiteboardSnapshots.bookingId, bookingId),
      orderBy: [desc(whiteboardSnapshots.createdAt)],
      limit: 100,
    });

    res.status(200).json({
      snapshots: rows.map((r) => ({
        id: r.id,
        title: r.title,
        scene: r.scene,
        imageUrl: r.imageUrl,
        timestamp: r.createdAt?.toISOString(),
        authorName: r.authorName,
        authorRole: r.authorRole,
        createdAt: r.createdAt?.toISOString(),
      })),
    });
  } catch (err: any) {
    logger.error({ err }, 'Get whiteboard snapshots error');
    res.status(500).json({ error: 'Failed to fetch whiteboard snapshots' });
  }
};

// ─── Session sticky notes (DB source of truth, one row per note) ────────────
// Personal notes are private to `ownerId`; shared notes are booking-wide.
// Writes are allowed for JWT participants (teacher/parent of the booking) and
// — without a token — only for code-joined children presenting a valid
// (childId, code) pair for this booking.

const NOTE_COLORS = new Set(['yellow', 'blue', 'green', 'pink', 'purple']);
const NOTE_ROLES = new Set(['parent', 'teacher', 'child']);
const MAX_NOTES = 100;
const MAX_CONTENT_CHARS = 50000;

interface NotesParticipant {
  ownerId: string;
  displayName?: string | null;
}

/** Attach the JWT user when a Bearer token is present (routes allow unauth). */
const tryAttachJwtUser = async (req: Request): Promise<{ id: string; role: string } | null> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; role: string };
    const user = await db.query.users.findFirst({ where: eq(users.id, decoded.id) });
    if (!user || (user as any).deletedAt || (user as any).status === 'disabled') return null;
    return { id: user.id, role: user.role };
  } catch {
    return null;
  }
};

/**
 * Resolve the calling participant for a notes read/write. JWT teachers/parents
 * must belong to the booking; token-less callers must present a valid
 * child join code for this booking. Returns the owner id or sends 401/403/404.
 */
const resolveNotesParticipant = async (
  req: Request,
  res: Response,
  bookingId: string,
): Promise<(NotesParticipant & { booking: NonNullable<Awaited<ReturnType<typeof getBookingWithAccess>>['booking']> }) | null> => {
  const jwtUser = await tryAttachJwtUser(req);
  if (jwtUser) {
    const { booking, error, status } = await getBookingWithAccess(bookingId, jwtUser.id);
    if (!booking) {
      res.status(status).json({ error });
      return null;
    }
    return { ownerId: jwtUser.id, booking };
  }

  // No JWT — only code-joined children with a valid (childId, code) pair.
  const childId = (req.body?.childId as string | undefined) ?? (req.query?.childId as string | undefined);
  const code = (req.body?.code as string | undefined) ?? (req.query?.code as string | undefined);
  if (!childId || !code) {
    res.status(401).json({ error: 'Authentication required (JWT or valid child join code)' });
    return null;
  }
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return null;
  }
  const joinCode = await db.query.sessionJoinCodes.findFirst({
    where: and(
      eq(sessionJoinCodes.bookingId, bookingId),
      eq(sessionJoinCodes.childId, childId),
      eq(sessionJoinCodes.code, code),
    ),
  });
  if (!joinCode) {
    res.status(403).json({ error: 'Invalid join code for this session' });
    return null;
  }
  return { ownerId: childId, booking };
};

const toNoteResponse = (r: typeof sessionNotes.$inferSelect) => ({
  id: r.id,
  title: r.title,
  content: r.content,
  color: r.color,
  authorName: r.authorName,
  authorRole: r.authorRole,
  createdAt: r.createdAt?.toISOString(),
  updatedAt: r.updatedAt?.toISOString(),
});

const sanitizeNotesInput = (raw: unknown): { ok: true; notes: Array<Record<string, any>> } | { ok: false; error: string } => {
  if (!Array.isArray(raw)) return { ok: false, error: '`notes` must be an array' };
  if (raw.length > MAX_NOTES) return { ok: false, error: `Too many notes (max ${MAX_NOTES})` };
  const notes: Array<Record<string, any>> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Each note must be an object' };
    const rec = item as Record<string, any>;
    const content = typeof rec.content === 'string' ? rec.content : '';
    if (content.length > MAX_CONTENT_CHARS) {
      return { ok: false, error: `Note content too large (max ${MAX_CONTENT_CHARS} chars)` };
    }
    notes.push({
      id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim().slice(0, 255) : createId(),
      title: typeof rec.title === 'string' ? rec.title.slice(0, 255) : 'Untitled Note',
      content,
      color: typeof rec.color === 'string' && NOTE_COLORS.has(rec.color) ? rec.color : 'yellow',
      authorName: typeof rec.authorName === 'string' ? rec.authorName.slice(0, 255) : null,
      authorRole: typeof rec.authorRole === 'string' && NOTE_ROLES.has(rec.authorRole) ? rec.authorRole : null,
    });
  }
  const ids = new Set(notes.map((n) => n.id));
  if (ids.size !== notes.length) return { ok: false, error: 'Duplicate note ids in payload' };
  return { ok: true, notes };
};

// GET /sessions/:bookingId/notes — full session notes (personal scoped to caller)
export const getSessionNotes = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const participant = await resolveNotesParticipant(req, res, bookingId);
    if (!participant) return;

    const rows = await db.query.sessionNotes.findMany({
      where: eq(sessionNotes.bookingId, bookingId),
      limit: MAX_NOTES * 2,
    });

    const personal = rows
      .filter((r) => r.kind === 'personal' && r.ownerId === participant.ownerId)
      .map(toNoteResponse);
    const shared = rows.filter((r) => r.kind === 'shared').map(toNoteResponse);
    const latest = rows.reduce<string | undefined>((acc, r) => {
      const t = r.updatedAt?.toISOString();
      return t && (!acc || t > acc) ? t : acc;
    }, undefined);

    res.status(200).json({ personalNotes: personal, sharedNotes: shared, updatedAt: latest });
  } catch (err: any) {
    logger.error({ err }, 'Get session notes error');
    res.status(500).json({ error: 'Failed to fetch session notes' });
  }
};

/** Replace one note set (personal scope or booking-wide shared scope). */
const replaceNoteSet = async (
  bookingId: string,
  kind: 'personal' | 'shared',
  callerOwnerId: string,
  incoming: Array<Record<string, any>>,
) => {
  const scope = kind === 'personal'
    ? and(eq(sessionNotes.bookingId, bookingId), eq(sessionNotes.kind, kind), eq(sessionNotes.ownerId, callerOwnerId))
    : and(eq(sessionNotes.bookingId, bookingId), eq(sessionNotes.kind, kind));

  return db.transaction(async (tx) => {
    const existing = await tx.query.sessionNotes.findMany({ where: scope, limit: MAX_NOTES * 2 });
    const existingById = new Map(existing.map((r) => [r.id, r]));
    const incomingIds = new Set(incoming.map((n) => n.id as string));
    const staleIds = existing.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (staleIds.length > 0) {
      await tx.delete(sessionNotes).where(and(scope, inArray(sessionNotes.id, staleIds)));
    }
    for (const n of incoming) {
      const ownerId = kind === 'personal' ? callerOwnerId : ((existingById.get(n.id as string)?.ownerId as string | null) ?? callerOwnerId);
      await tx
        .insert(sessionNotes)
        .values({
          id: n.id as string,
          bookingId,
          ownerId,
          kind,
          title: n.title as string,
          content: n.content as string,
          color: (n.color as string) || 'yellow',
          authorName: (n.authorName as string | null) ?? null,
          authorRole: (n.authorRole as string | null) ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sessionNotes.id,
          set: {
            title: n.title as string,
            content: n.content as string,
            color: (n.color as string) || 'yellow',
            authorName: (n.authorName as string | null) ?? null,
            authorRole: (n.authorRole as string | null) ?? null,
            updatedAt: new Date(),
          },
        });
    }
    return tx.query.sessionNotes.findMany({ where: scope, limit: MAX_NOTES * 2 });
  });
};

// PUT /sessions/:bookingId/notes — batch replace personal and/or shared in one request
export const putSessionNotes = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const participant = await resolveNotesParticipant(req, res, bookingId);
    if (!participant) return;

    const { personalNotes, sharedNotes } = req.body || {};
    let personalResult: ReturnType<typeof toNoteResponse>[] | undefined;
    let sharedResult: ReturnType<typeof toNoteResponse>[] | undefined;

    if (personalNotes !== undefined) {
      const parsed = sanitizeNotesInput(personalNotes);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const saved = await replaceNoteSet(bookingId, 'personal', participant.ownerId, parsed.notes);
      personalResult = saved.map(toNoteResponse);
    }

    if (sharedNotes !== undefined) {
      const parsed = sanitizeNotesInput(sharedNotes);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const saved = await replaceNoteSet(bookingId, 'shared', participant.ownerId, parsed.notes);
      sharedResult = saved.map(toNoteResponse);
    }

    res.status(200).json({ personalNotes: personalResult, sharedNotes: sharedResult });
  } catch (err: any) {
    logger.error({ err }, 'Put session notes (batch) error');
    res.status(500).json({ error: 'Failed to save notes' });
  }
};

// PUT /sessions/:bookingId/notes/personal — replace the caller's personal notes
export const putPersonalNotes = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const participant = await resolveNotesParticipant(req, res, bookingId);
    if (!participant) return;

    const parsed = sanitizeNotesInput(req.body?.notes);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const saved = await replaceNoteSet(bookingId, 'personal', participant.ownerId, parsed.notes);
    res.status(200).json({ personalNotes: saved.map(toNoteResponse) });
  } catch (err: any) {
    logger.error({ err }, 'Put personal notes error');
    res.status(500).json({ error: 'Failed to save personal notes' });
  }
};

// PUT /sessions/:bookingId/notes/shared — replace the booking's shared notes
export const putSharedNotes = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const participant = await resolveNotesParticipant(req, res, bookingId);
    if (!participant) return;

    const parsed = sanitizeNotesInput(req.body?.notes);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const saved = await replaceNoteSet(bookingId, 'shared', participant.ownerId, parsed.notes);
    res.status(200).json({ sharedNotes: saved.map(toNoteResponse) });
  } catch (err: any) {
    logger.error({ err }, 'Put shared notes error');
    res.status(500).json({ error: 'Failed to save shared notes' });
  }
};

// PATCH /bookings/:bookingId/start-session — mark session started
export const startSession = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { booking, error, status } = await getBookingWithAccess(bookingId, req.user.id);
    if (!booking) return res.status(status).json({ error });

    if (booking.status !== 'paid_escrow') {
      return res.status(400).json({ error: 'Session can only be started for paid bookings' });
    }

    if (booking.sessionStartedAt) {
      return res.status(200).json({ booking, message: 'Session already started' });
    }

    const [updated] = await db.update(bookings)
      .set({ sessionStartedAt: new Date(), sessionRoomId: booking.id, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    res.status(200).json({ booking: updated });
  } catch (err: any) {
    logger.error({ err }, 'Start session error');
    res.status(500).json({ error: 'Failed to start session' });
  }
};

// PATCH /bookings/:bookingId/end-session — mark session ended
export const endSession = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { booking, error, status } = await getBookingWithAccess(bookingId, req.user.id);
    if (!booking) return res.status(status).json({ error });

    // Booking wall-clock is Africa/Lagos time — parse explicitly so the result
    // does not depend on the server's OS timezone.
    const scheduledEnd = booking.scheduledDate && booking.endTime
      ? parseBookingDateTime(booking.scheduledDate, booking.endTime)
      : null;
    if (!scheduledEnd || Number.isNaN(scheduledEnd.getTime())) {
      return res.status(400).json({ error: 'Session end time is not set' });
    }
    if (new Date() < scheduledEnd) {
      return res.status(400).json({ error: 'A booking cannot be completed before its scheduled end time' });
    }

    if (booking.sessionEndedAt) {
      return res.status(200).json({ booking, message: 'Session already ended' });
    }

    const [updated] = await db.update(bookings)
      .set({ status: 'completed', sessionEndedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    res.status(200).json({ booking: updated });
  } catch (err: any) {
    logger.error({ err }, 'End session error');
    res.status(500).json({ error: 'Failed to end session' });
  }
};
