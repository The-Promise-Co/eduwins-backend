import express from 'express';
import adminAuthMiddleware from '../middleware/adminAuth';
import {
  getPublicSubjects,
  listAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../controllers/subjectController';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Subjects
 *   description: Subject endpoints for the platform
 */

/**
 * @swagger
 * /subjects:
 *   get:
 *     summary: Get all active subjects
 *     tags: [Subjects]
 *     responses:
 *       200:
 *         description: A list of active subjects
 *       500:
 *         description: Server Error
 */
router.get('/', getPublicSubjects as any);

// ── Admin CRUD ──────────────────────────────────────────────────────────────

router.get('/all', adminAuthMiddleware as any, listAllSubjects as any);
router.post('/', adminAuthMiddleware as any, createSubject as any);
router.put('/:id', adminAuthMiddleware as any, updateSubject as any);
router.delete('/:id', adminAuthMiddleware as any, deleteSubject as any);

export default router;
