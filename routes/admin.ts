// import express from 'express';
// import authenticateToken from '../middleware/auth';
// import {
//   getOverview,
//   listRentApplications,
//   processRentApplication,
//   listAmbassadors,
//   listVettingQueue,
//   processVetting,
//   payoutEscrow,
//   listDisputes,
//   createDispute,
//   updateDispute,
//   getWelfareAnalytics,
// } from '../controllers/adminController';

// const router = express.Router();

// router.get('/overview', authenticateToken, getOverview as any);
// router.get('/rent-applications', authenticateToken, listRentApplications as any);
// router.post('/rent-applications/:id', authenticateToken, processRentApplication as any);
// router.get('/ambassadors', authenticateToken, listAmbassadors as any);

// // Vetting queue
// router.get('/vetting', authenticateToken, listVettingQueue as any);
// router.post('/vetting/:teacherId', authenticateToken, processVetting as any);

// // Escrow payout
// router.post('/escrow/payout/:bookingId', authenticateToken, payoutEscrow as any);

// // Conflict Disputes
// router.get('/disputes', authenticateToken, listDisputes as any);
// router.post('/disputes', authenticateToken, createDispute as any);
// router.patch('/disputes/:disputeId', authenticateToken, updateDispute as any);

// // Welfare Analytics
// router.get('/welfare-analytics', authenticateToken, getWelfareAnalytics as any);

// export default router;
