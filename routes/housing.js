const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  checkEligibility,
  getHousingStatus,
  applyForHousing,
  processMonthlyPayment,
  getMortgageSchedule,
  getPaymentHistory,
} = require('../controllers/housingController');
const {
  createPartnership,
  addProperty,
  getProperties,
  getApplications,
  approveApplication,
  rejectApplication,
  getDashboard,
  getPartnershipDetails,
} = require('../controllers/partnershipController');

/**
 * TEACHER ROUTES
 */

/**
 * GET /api/housing/eligibility
 * Check teacher's housing eligibility status
 * Verifies: 6 months teaching, 4.5+ rating, active lessons, verified credentials
 */
router.get('/eligibility', auth, checkEligibility);

/**
 * GET /api/housing/status
 * Get teacher's complete housing program status
 * Includes: eligibility, welfare fund progress, mortgage status
 */
router.get('/status', auth, getHousingStatus);

/**
 * POST /api/housing/apply
 * Submit housing application for approved property
 * Body: { propertyId, mortgageDetails: { downPayment, loanTerm, interestRate } }
 */
router.post('/apply', auth, applyForHousing);

/**
 * POST /api/housing/process-payment
 * Process monthly mortgage payment from teacher earnings
 * Body: { earningsForMonth }
 */
router.post('/process-payment', auth, processMonthlyPayment);

/**
 * GET /api/housing/mortgage/:mortgageId/schedule
 * Get full amortization schedule for mortgage
 */
router.get('/mortgage/:mortgageId/schedule', getMortgageSchedule);

/**
 * GET /api/housing/payments
 * Get teacher's mortgage payment history
 */
router.get('/payments', auth, getPaymentHistory);

/**
 * ADMIN ROUTES (Partnership Management)
 */

/**
 * POST /api/admin/housing/partnerships
 * Create new partnership (Developer/FMBN)
 * Body: { partnerType, organizationName, contactPerson, email, phone, terms }
 * Note: Requires admin authentication
 */
router.post('/admin/partnerships', auth, createPartnership);

/**
 * POST /api/admin/housing/properties
 * Add properties to partnership program
 * Body: { partnershipId, propertyDetails: { address, price, bedrooms, etc., availableUnits } }
 */
router.post('/admin/properties', auth, addProperty);

/**
 * GET /api/admin/housing/properties
 * Get all properties (optionally filtered by status)
 * Query: ?status=available&partnership=partnershipId
 */
router.get('/admin/properties', auth, getProperties);

/**
 * GET /api/admin/housing/applications
 * Get all housing applications for review
 * Query: ?status=pending&partnership=partnershipId
 */
router.get('/admin/applications', auth, getApplications);

/**
 * POST /api/admin/housing/applications/:applicationId/approve
 * Approve a housing application
 * Body: { notes }
 */
router.post('/admin/applications/:applicationId/approve', auth, approveApplication);

/**
 * POST /api/admin/housing/applications/:applicationId/reject
 * Reject a housing application
 * Body: { reason }
 */
router.post('/admin/applications/:applicationId/reject', auth, rejectApplication);

/**
 * GET /api/admin/housing/dashboard
 * Get admin housing program dashboard
 * Shows: partnerships, properties, applications, mortgages, impact metrics
 */
router.get('/admin/dashboard', auth, getDashboard);

/**
 * GET /api/admin/housing/partnerships/:partnershipId
 * Get details for specific partnership
 */
router.get('/admin/partnerships/:partnershipId', auth, getPartnershipDetails);

module.exports = router;
