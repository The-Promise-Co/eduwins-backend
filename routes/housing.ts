import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  checkEligibility,
  getHousingStatus,
  applyForHousing,
  processMonthlyPayment,
  getMortgageSchedule,
  getPaymentHistory,
} from '../controllers/housingController';
import {
  createPartnership,
  addProperty,
  getProperties,
  getApplications,
  approveApplication,
  rejectApplication,
  getDashboard,
  getPartnershipDetails,
} from '../controllers/partnershipController';

const router = express.Router();

/**
 * TEACHER ROUTES
 */

/**
 * GET /api/housing/eligibility
 * Check teacher's housing eligibility status
 */
router.get('/eligibility', authenticateToken, checkEligibility as any);

/**
 * GET /api/housing/status
 * Get teacher's complete housing program status
 */
router.get('/status', authenticateToken, getHousingStatus as any);

/**
 * POST /api/housing/apply
 * Submit housing application for approved property
 */
router.post('/apply', authenticateToken, applyForHousing as any);

/**
 * POST /api/housing/process-payment
 * Process monthly mortgage payment from teacher earnings
 */
router.post('/process-payment', authenticateToken, processMonthlyPayment as any);

/**
 * GET /api/housing/mortgage/:mortgageId/schedule
 * Get full amortization schedule for mortgage
 */
router.get('/mortgage/:mortgageId/schedule', getMortgageSchedule as any);

/**
 * GET /api/housing/payments
 * Get teacher's mortgage payment history
 */
router.get('/payments', authenticateToken, getPaymentHistory as any);

/**
 * ADMIN ROUTES (Partnership Management)
 */

/**
 * POST /api/admin/housing/partnerships
 * Create new partnership (Developer/FMBN)
 */
router.post('/admin/partnerships', authenticateToken, createPartnership as any);

/**
 * POST /api/admin/housing/properties
 * Add properties to partnership program
 */
router.post('/admin/properties', authenticateToken, addProperty as any);

/**
 * GET /api/admin/housing/properties
 * Get all properties
 */
router.get('/admin/properties', authenticateToken, getProperties as any);

/**
 * GET /api/admin/housing/applications
 * Get all housing applications for review
 */
router.get('/admin/applications', authenticateToken, getApplications as any);

/**
 * POST /api/admin/housing/applications/:applicationId/approve
 * Approve a housing application
 */
router.post('/admin/applications/:applicationId/approve', authenticateToken, approveApplication as any);

/**
 * POST /api/admin/housing/applications/:applicationId/reject
 * Reject a housing application
 */
router.post('/admin/applications/:applicationId/reject', authenticateToken, rejectApplication as any);

/**
 * GET /api/admin/housing/dashboard
 * Get admin housing program dashboard
 */
router.get('/admin/dashboard', authenticateToken, getDashboard as any);

/**
 * GET /api/admin/housing/partnerships/:partnershipId
 * Get details for specific partnership
 */
router.get('/admin/partnerships/:partnershipId', authenticateToken, getPartnershipDetails as any);

export default router;
