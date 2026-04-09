const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { pool } = require('../config/db');

// Get all digital vault items
router.get('/', async (req, res) => {
  try {
    const { subject, teacher_id, min_price, max_price } = req.query;

    let query = `
      SELECT dv.*, u.full_name as teacher_name, tp.rating_avg, tp.total_sessions
      FROM digital_vault dv
      JOIN users u ON dv.teacher_id = u.id
      JOIN teacher_profiles tp ON dv.teacher_id = tp.user_id
      WHERE dv.is_active = true
    `;

    const params = [];
    let paramCount = 1;

    if (subject) {
      query += ` AND dv.subject = $${paramCount}`;
      params.push(subject);
      paramCount++;
    }

    if (teacher_id) {
      query += ` AND dv.teacher_id = $${paramCount}`;
      params.push(teacher_id);
      paramCount++;
    }

    if (min_price) {
      query += ` AND dv.price >= $${paramCount}`;
      params.push(min_price);
      paramCount++;
    }

    if (max_price) {
      query += ` AND dv.price <= $${paramCount}`;
      params.push(max_price);
      paramCount++;
    }

    query += ' ORDER BY dv.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get vault items error:', err);
    res.status(500).json({ error: 'Failed to fetch vault items' });
  }
});

// Get single vault item
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dv.*, u.full_name as teacher_name, tp.rating_avg, tp.total_sessions
      FROM digital_vault dv
      JOIN users u ON dv.teacher_id = u.id
      JOIN teacher_profiles tp ON dv.teacher_id = tp.user_id
      WHERE dv.id = $1 AND dv.is_active = true
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get vault item error:', err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Create vault item (teachers only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, subject, content_type, price, file_url, preview_url } = req.body;
    const teacherId = req.user.id;

    // Verify user is a teacher
    const teacherCheck = await pool.query(
      'SELECT user_id FROM teacher_profiles WHERE user_id = $1',
      [teacherId]
    );

    if (teacherCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only teachers can create vault items' });
    }

    const result = await pool.query(`
      INSERT INTO digital_vault (teacher_id, title, description, subject, content_type, price, file_url, preview_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [teacherId, title, description, subject, content_type, price, file_url, preview_url]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create vault item error:', err);
    res.status(500).json({ error: 'Failed to create vault item' });
  }
});

// Update vault item (owner only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, subject, price, file_url, preview_url, is_active } = req.body;
    const itemId = req.params.id;
    const teacherId = req.user.id;

    // Check ownership
    const ownershipCheck = await pool.query(
      'SELECT teacher_id FROM digital_vault WHERE id = $1',
      [itemId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (ownershipCheck.rows[0].teacher_id !== teacherId) {
      return res.status(403).json({ error: 'You can only edit your own items' });
    }

    const result = await pool.query(`
      UPDATE digital_vault
      SET title = $1, description = $2, subject = $3, price = $4,
          file_url = $5, preview_url = $6, is_active = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [title, description, subject, price, file_url, preview_url, is_active, itemId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update vault item error:', err);
    res.status(500).json({ error: 'Failed to update vault item' });
  }
});

// Purchase vault item
router.post('/:id/purchase', authMiddleware, async (req, res) => {
  try {
    const itemId = req.params.id;
    const buyerId = req.user.id;

    // Get item details
    const itemResult = await pool.query(
      'SELECT * FROM digital_vault WHERE id = $1 AND is_active = true',
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or not available' });
    }

    const item = itemResult.rows[0];

    // Check if already purchased
    const purchaseCheck = await pool.query(
      'SELECT id FROM vault_purchases WHERE item_id = $1 AND buyer_id = $2',
      [itemId, buyerId]
    );

    if (purchaseCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Item already purchased' });
    }

    // Record purchase
    const purchaseResult = await pool.query(`
      INSERT INTO vault_purchases (item_id, buyer_id, price_paid)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [itemId, buyerId, item.price]);

    // Update teacher's earnings (this would integrate with payment system)
    await pool.query(`
      UPDATE teacher_profiles
      SET total_earnings = COALESCE(total_earnings, 0) + $1
      WHERE user_id = $2
    `, [item.price, item.teacher_id]);

    res.json({
      purchase: purchaseResult.rows[0],
      download_url: item.file_url,
      message: 'Purchase successful! You can now download the content.'
    });
  } catch (err) {
    console.error('Purchase vault item error:', err);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
});

// Get teacher's vault items
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dv.*, u.full_name as teacher_name
      FROM digital_vault dv
      JOIN users u ON dv.teacher_id = u.id
      WHERE dv.teacher_id = $1
      ORDER BY dv.created_at DESC
    `, [req.params.teacherId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get teacher vault items error:', err);
    res.status(500).json({ error: 'Failed to fetch teacher items' });
  }
});

// Get user's purchases
router.get('/purchases/my', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vp.*, dv.title, dv.description, dv.subject, dv.content_type,
             u.full_name as teacher_name, vp.purchase_date
      FROM vault_purchases vp
      JOIN digital_vault dv ON vp.item_id = dv.id
      JOIN users u ON dv.teacher_id = u.id
      WHERE vp.buyer_id = $1
      ORDER BY vp.purchase_date DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get user purchases error:', err);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

module.exports = router;
