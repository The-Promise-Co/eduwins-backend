import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  getVaultItems,
  getVaultItem,
  createVaultItem,
  updateVaultItem,
  purchaseVaultItem,
  getTeacherVaultItems,
  getMyPurchases,
} from '../controllers/vaultController';

const router = express.Router();

/**
 * GET /api/vault
 * List available vault items with filters
 */
router.get('/', getVaultItems as any);

/**
 * GET /api/vault/purchases/my
 * Get current user's purchased items
 */
router.get('/purchases/my', authenticateToken, getMyPurchases as any);

/**
 * GET /api/vault/:id
 * Get details for a single vault item
 */
router.get('/:id', getVaultItem as any);

/**
 * POST /api/vault
 * Create a new vault item (Teacher only)
 */
router.post('/', authenticateToken, createVaultItem as any);

/**
 * PUT /api/vault/:id
 * Update a vault item (Owner only)
 */
router.put('/:id', authenticateToken, updateVaultItem as any);

/**
 * POST /api/vault/:id/purchase
 * Purchase a vault item
 */
router.post('/:id/purchase', authenticateToken, purchaseVaultItem as any);

/**
 * GET /api/vault/teacher/:teacherId
 * Get all vault items by a specific teacher
 */
router.get('/teacher/:teacherId', getTeacherVaultItems as any);

export default router;
