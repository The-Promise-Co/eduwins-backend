const { pool } = require('../config/db');

exports.createReport = async (req, res) => {
  const teacherId = req.user.id;
  const { studentId, weekStart, weekEnd, performanceSummary, attendanceScore, skillImprovementScore, homeworkCompletion, notes } = req.body;

  try {
    const parentProfile = await pool.query('SELECT user_id FROM parent_profiles WHERE user_id = $1', [studentId]);
    if (parentProfile.rows.length === 0) {
      return res.status(404).json({ error: 'Student parent profile not found' });
    }

    const teacherProfile = await pool.query('SELECT user_id FROM teacher_profiles WHERE user_id = $1', [teacherId]);
    if (teacherProfile.rows.length === 0) {
      return res.status(403).json({ error: 'Only teachers can send progress reports' });
    }

    const result = await pool.query(`
      INSERT INTO progress_reports (student_id, teacher_id, week_start, week_end, performance_summary, attendance_score, skill_improvement_score, homework_completion, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [studentId, teacherId, weekStart, weekEnd, performanceSummary, attendanceScore, skillImprovementScore, homeworkCompletion, notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create report error:', err);
    res.status(500).json({ error: 'Could not create progress report' });
  }
};

exports.getReports = async (req, res) => {
  const parentId = req.user.id;

  try {
    const parentProfile = await pool.query('SELECT user_id FROM parent_profiles WHERE user_id = $1', [parentId]);
    if (parentProfile.rows.length === 0) {
      return res.status(403).json({ error: 'Only parents can access progress reports' });
    }

    const result = await pool.query(`
      SELECT pr.*, u.full_name as teacher_name
      FROM progress_reports pr
      JOIN users u ON pr.teacher_id = u.id
      WHERE pr.student_id = $1
      ORDER BY pr.week_start DESC
    `, [parentId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ error: 'Could not fetch progress reports' });
  }
};
