import express from 'express';
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

export default router;
