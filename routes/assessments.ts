import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  listAssessments,
  createAssessment,
  lookupAssignee,
  myAssignments,
  getAssessment,
  updateAssessment,
  publishAssessment,
  listAssignments,
  inviteAssignment,
  revokeAssignment,
  startAttempt,
  getAttempt,
  saveAttemptAnswers,
  submitAttempt,
  gradeAttempt,
} from '../controllers/assessmentController';

const router = express.Router();

// All assessment routes require authentication
router.get('/', authenticateToken, listAssessments as any);
router.post('/', authenticateToken, createAssessment as any);
// Static paths before :id
router.get('/lookup', authenticateToken, lookupAssignee as any);
router.get('/my-assignments', authenticateToken, myAssignments as any);
router.get('/:id', authenticateToken, getAssessment as any);
router.put('/:id', authenticateToken, updateAssessment as any);
router.post('/:id/publish', authenticateToken, publishAssessment as any);
router.get('/:id/assignments', authenticateToken, listAssignments as any);
router.post('/:id/assignments', authenticateToken, inviteAssignment as any);
router.delete('/:id/assignments/:assignmentId', authenticateToken, revokeAssignment as any);
router.post('/:id/attempts', authenticateToken, startAttempt as any);

export const attemptsRouter = express.Router();
attemptsRouter.get('/:attemptId', authenticateToken, getAttempt as any);
attemptsRouter.put('/:attemptId/answers', authenticateToken, saveAttemptAnswers as any);
attemptsRouter.post('/:attemptId/submit', authenticateToken, submitAttempt as any);
attemptsRouter.patch('/:attemptId/grade', authenticateToken, gradeAttempt as any);

export default router;
