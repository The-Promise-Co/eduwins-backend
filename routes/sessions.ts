import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  getToken,
  joinByCode,
  getChildCodes,
  postSessionEvent,
  getSessionEvents,
  getSessionNotes,
  putPersonalNotes,
  putSharedNotes,
  postWhiteboardSnapshot,
  getWhiteboardSnapshots,
  startSession,
  endSession,
} from '../controllers/sessionController';

// LiveKit-specific routes (mounted at /api/livekit)
export const livekitRouter = express.Router();
livekitRouter.post('/token', authenticateToken, getToken as any);
livekitRouter.get('/join/:code', joinByCode as any);
livekitRouter.get('/codes/:bookingId', authenticateToken, getChildCodes as any);

// Session management routes (mounted at /api/sessions)
export const sessionRouter = express.Router();
sessionRouter.post('/:bookingId/events', postSessionEvent as any);
sessionRouter.get('/:bookingId/events', authenticateToken, getSessionEvents as any);
// Sticky notes: the DB is the source of truth. Auth is resolved inside the
// handlers — JWT (teacher/parent of the booking) or a valid child join code
// (childId + code) for code-joined children without a token.
sessionRouter.get('/:bookingId/notes', getSessionNotes as any);
sessionRouter.put('/:bookingId/notes/personal', express.json({ limit: '1mb' }) as any, putPersonalNotes as any);
sessionRouter.put('/:bookingId/notes/shared', express.json({ limit: '1mb' }) as any, putSharedNotes as any);
// Scene JSON payloads can be large — allow up to 5mb on snapshot routes.
sessionRouter.post(
  '/:bookingId/whiteboard/snapshots',
  express.json({ limit: '5mb' }) as any,
  postWhiteboardSnapshot as any,
);
sessionRouter.get('/:bookingId/whiteboard/snapshots', authenticateToken, getWhiteboardSnapshots as any);
sessionRouter.patch('/:bookingId/start-session', authenticateToken, startSession as any);
sessionRouter.patch('/:bookingId/end-session', authenticateToken, endSession as any);
