const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getOverview,
  listRentApplications,
  processRentApplication,
  listAmbassadors,
  listVettingQueue,
  processVetting,
  payoutEscrow,
  listDisputes,
  createDispute,
  updateDispute,
  getWelfareAnalytics,
} = require('../controllers/adminController');

router.get('/overview', authMiddleware, getOverview);
router.get('/rent-applications', authMiddleware, listRentApplications);
router.post('/rent-applications/:id', authMiddleware, processRentApplication);
router.get('/ambassadors', authMiddleware, listAmbassadors);

// Vetting queue
router.get('/vetting', authMiddleware, listVettingQueue);
router.post('/vetting/:teacherId', authMiddleware, processVetting);

// Escrow payout
router.post('/escrow/payout/:bookingId', authMiddleware, payoutEscrow);

// Conflict Disputes
router.get('/disputes', authMiddleware, listDisputes);
router.post('/disputes', authMiddleware, createDispute);
router.patch('/disputes/:disputeId', authMiddleware, updateDispute);

// Welfare Analytics
router.get('/welfare-analytics', authMiddleware, getWelfareAnalytics);

module.exports = router;
