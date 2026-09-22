import express from 'express';
import authenticateToken from '../middleware/auth';
import { acceptBookingRequest, cancelBookingRequest, createBookingRequest, denyBookingRequest, getBlockedSlots, getBookingRequest, getEscrowBreakdown, listBookingRequests } from '../controllers/bookingController';
import { createDispute } from '../controllers/disputeController';

const router = express.Router();

router.get('/blocked-slots', getBlockedSlots as any);
router.post('/requests', authenticateToken, createBookingRequest as any);
router.get('/requests', authenticateToken, listBookingRequests as any);
router.get('/:bookingId', authenticateToken, getBookingRequest as any);
router.get('/:bookingId/escrow-breakdown', authenticateToken, getEscrowBreakdown as any);
router.patch('/:bookingId/accept', authenticateToken, acceptBookingRequest as any);
router.patch('/:bookingId/deny', authenticateToken, denyBookingRequest as any);
router.patch('/:bookingId/cancel', authenticateToken, cancelBookingRequest as any);
router.post('/:bookingId/disputes', authenticateToken, createDispute as any);

export default router;
