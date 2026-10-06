import express from 'express';
import rateLimit from 'express-rate-limit';
import adminAuthMiddleware from '../middleware/adminAuth';
import {
  listVettingQueue,
  processVetting,
  verifyDocument,
  rejectDocument,
  getWelfareAnalytics,
  listPlatformConfigs,
  createPlatformConfig,
  updatePlatformConfig,
  deletePlatformConfig,
  getAdminOverview,
  listBookingsPending,
  listAllBookings,
  listAdminUsers,
  listPendingWithdrawals,
  listDisputes,
  updateDispute,
  retryBookingSettlement,
  listAllTeachers,
  getTeacherDetail,
  updateTeacherStatus,
  listTeacherBookings,
  getBookingDetail,
  deleteUser,
  updateUserStatus,
  emailTeacher,
  listAdminParents,
  getAdminParentDetail,
  listParentBookings,
} from '../controllers/adminController';
import {
  getBroadcastSegmentOptions,
  previewBroadcastAudience,
  previewBroadcastEmail,
  sendBroadcastTestEmail,
  listMessageGroups,
  createMessageGroup,
  getMessageGroup,
  cancelMessageGroup,
  listBroadcasts,
  getBroadcast,
  createBroadcast,
  cancelBroadcast,
  retryBroadcast,
  resumeBroadcast,
} from '../controllers/adminBroadcastController';

const router = express.Router();

// Dashboard overview
router.get('/overview', adminAuthMiddleware as any, getAdminOverview as any);

// Vetting queue
router.get('/vetting', adminAuthMiddleware as any, listVettingQueue as any);
router.post('/vetting/:teacherId', adminAuthMiddleware as any, processVetting as any);

// Document verification
router.put('/documents/:documentId/verify', adminAuthMiddleware as any, verifyDocument as any);
router.put('/documents/:documentId/reject', adminAuthMiddleware as any, rejectDocument as any);

// Welfare Analytics
router.get('/welfare-analytics', adminAuthMiddleware as any, getWelfareAnalytics as any);

// Bookings
router.get('/bookings-pending', adminAuthMiddleware as any, listBookingsPending as any);
router.get('/bookings', adminAuthMiddleware as any, listAllBookings as any);

// Users
router.get('/users', adminAuthMiddleware as any, listAdminUsers as any);
router.put('/users/:id/status', adminAuthMiddleware as any, updateUserStatus as any);
router.delete('/users/:id', adminAuthMiddleware as any, deleteUser as any);

// Withdrawals
router.get('/withdrawals-pending', adminAuthMiddleware as any, listPendingWithdrawals as any);

// Disputes
router.get('/disputes', adminAuthMiddleware as any, listDisputes as any);
router.patch('/disputes/:disputeId', adminAuthMiddleware as any, updateDispute as any);

// Manual escrow settlement retry (cron is the primary trigger)
router.post('/bookings/:bookingId/settle', adminAuthMiddleware as any, retryBookingSettlement as any);

// Platform config: tutor/welfare/fee split rules
router.get('/configs', adminAuthMiddleware as any, listPlatformConfigs as any);
router.post('/configs', adminAuthMiddleware as any, createPlatformConfig as any);
router.put('/configs/:id', adminAuthMiddleware as any, updatePlatformConfig as any);
router.delete('/configs/:id', adminAuthMiddleware as any, deletePlatformConfig as any);

// Teachers management
router.get('/teachers', adminAuthMiddleware as any, listAllTeachers as any);
router.get('/teachers/:id', adminAuthMiddleware as any, getTeacherDetail as any);
router.put('/teachers/:id/status', adminAuthMiddleware as any, updateTeacherStatus as any);
router.post('/teachers/:id/email', adminAuthMiddleware as any, emailTeacher as any);
router.get('/teachers/:id/bookings', adminAuthMiddleware as any, listTeacherBookings as any);

// Parents management
router.get('/parents', adminAuthMiddleware as any, listAdminParents as any);
router.get('/parents/:id', adminAuthMiddleware as any, getAdminParentDetail as any);
router.get('/parents/:id/bookings', adminAuthMiddleware as any, listParentBookings as any);

// Booking detail
router.get('/bookings/:id', adminAuthMiddleware as any, getBookingDetail as any);

// ── Broadcast messaging (email only) ───────────────────────────────────────
// Bulk sends are throttled per admin on top of the global /api limiter.
const broadcastLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many broadcast sends, please try again later.' },
  keyGenerator: (req) => (req as any).admin?.id || req.ip || 'unknown',
});

const sendPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many audience previews, slow down.' },
  keyGenerator: (req) => (req as any).admin?.id || req.ip || 'unknown',
});

router.get('/broadcasts/segment-options', adminAuthMiddleware as any, getBroadcastSegmentOptions as any);
router.post('/broadcasts/count', adminAuthMiddleware as any, sendPreviewLimiter as any, previewBroadcastAudience as any);
router.post('/broadcasts/preview', adminAuthMiddleware as any, sendPreviewLimiter as any, previewBroadcastEmail as any);
router.post('/broadcasts/test', adminAuthMiddleware as any, broadcastLimiter as any, sendBroadcastTestEmail as any);

router.get('/broadcasts', adminAuthMiddleware as any, listBroadcasts as any);
router.post('/broadcasts', adminAuthMiddleware as any, broadcastLimiter as any, createBroadcast as any);
router.get('/broadcasts/:id', adminAuthMiddleware as any, getBroadcast as any);
router.post('/broadcasts/:id/cancel', adminAuthMiddleware as any, cancelBroadcast as any);
router.post('/broadcasts/:id/retry-failed', adminAuthMiddleware as any, broadcastLimiter as any, retryBroadcast as any);
router.post('/broadcasts/:id/resume', adminAuthMiddleware as any, broadcastLimiter as any, resumeBroadcast as any);

router.get('/message-groups', adminAuthMiddleware as any, listMessageGroups as any);
router.post('/message-groups', adminAuthMiddleware as any, createMessageGroup as any);
router.get('/message-groups/:id', adminAuthMiddleware as any, getMessageGroup as any);
router.post('/message-groups/:id/cancel', adminAuthMiddleware as any, cancelMessageGroup as any);

export default router;
