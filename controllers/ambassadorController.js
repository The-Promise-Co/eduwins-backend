const { pool } = require('../config/db');

exports.apply = async (req, res) => {
  const teacherId = req.user.id;
  const { mentorId } = req.body;

  try {
    const teacherProfile = await pool.query('SELECT user_id FROM teacher_profiles WHERE user_id = $1', [teacherId]);
    if (teacherProfile.rows.length === 0) return res.status(403).json({ error: 'Only teachers can join ambassador program' });

    const existing = await pool.query('SELECT * FROM ambassadors WHERE user_id = $1', [teacherId]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Already in ambassador program' });

    let level = 1;

    if (mentorId) {
      const mentor = await pool.query('SELECT * FROM ambassadors WHERE user_id = $1 AND status = $2', [mentorId, 'active']);
      if (mentor.rows.length === 0) return res.status(400).json({ error: 'Mentor not found or not active' });
      level = 2;
    }

    await pool.query('INSERT INTO ambassadors (user_id, mentor_id, level) VALUES ($1, $2, $3)', [teacherId, mentorId || null, level]);

    res.json({ message: 'Ambassador status granted', level });
  } catch (err) {
    console.error('Ambassador apply error:', err);
    res.status(500).json({ error: 'Could not apply for ambassador' });
  }
};

exports.me = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ambassadors WHERE user_id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not an ambassador yet' });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ambassador me error:', err);
    res.status(500).json({ error: 'Could not fetch ambassador data' });
  }
};

exports.rewardReferral = async (req, res) => {
  try {
    const { referrerId, level } = req.body;
    if (!referrerId || ![1,2].includes(level)) {
      return res.status(400).json({ error: 'referrerId and level (1 or 2) are required' });
    }

    const amount = level === 1 ? 1000 : 500;

    await pool.query('UPDATE ambassadors SET earned_credits = earned_credits + $1 WHERE user_id = $2', [amount, referrerId]);

    res.json({ message: 'Ambassador reward credited', amount });
  } catch (err) {
    console.error('Ambassador reward error:', err);
    res.status(500).json({ error: 'Could not reward ambassador' });
  }
};
