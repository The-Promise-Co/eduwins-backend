import express from 'express';
import adminAuthMiddleware from '../middleware/adminAuth';
import {
  createTeamMember,
  deleteTeamMember,
  getPublishedTeamMember,
  listAllTeamMembers,
  listPublishedTeamMembers,
  updateTeamMember,
} from '../controllers/teamMemberController';

const router = express.Router();

router.get('/', listPublishedTeamMembers as any);
router.get('/admin/all', adminAuthMiddleware as any, listAllTeamMembers as any);
router.post('/admin', adminAuthMiddleware as any, createTeamMember as any);
router.put('/admin/:id', adminAuthMiddleware as any, updateTeamMember as any);
router.delete('/admin/:id', adminAuthMiddleware as any, deleteTeamMember as any);
router.get('/:slug', getPublishedTeamMember as any);

export default router;
