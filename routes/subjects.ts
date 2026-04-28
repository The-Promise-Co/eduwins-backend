import express from 'express';
import { getPublicSubjects } from '../controllers/subjectController';

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
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "subj_12345"
 *                   name:
 *                     type: string
 *                     example: "Mathematics"
 *                   isActive:
 *                     type: boolean
 *                     example: true
 *       500:
 *         description: Server Error
 */
router.get('/', getPublicSubjects as any);

export default router;
