import express from 'express';
import authenticateToken from '../middleware/auth';
import { acceptBookingRequest, createBookingRequest, denyBookingRequest, getBookingRequest, listBookingRequests } from '../controllers/bookingController';

const router = express.Router();

router.post('/requests', authenticateToken, createBookingRequest as any);
router.get('/requests', authenticateToken, listBookingRequests as any);
router.get('/:bookingId', authenticateToken, getBookingRequest as any);
router.patch('/:bookingId/accept', authenticateToken, acceptBookingRequest as any);
router.patch('/:bookingId/deny', authenticateToken, denyBookingRequest as any);

export default router;
