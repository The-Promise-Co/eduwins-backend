import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  getChildren,
  getChild,
  registerChild,
  updateChild,
  deleteChild,
} from '../controllers/childrenController';

const router = express.Router();

// All routes require authentication
router.get('/', authenticateToken, getChildren as any);
router.get('/:childId', authenticateToken, getChild as any);
router.post('/', authenticateToken, registerChild as any);
router.put('/:childId', authenticateToken, updateChild as any);
router.delete('/:childId', authenticateToken, deleteChild as any);

export default router;
