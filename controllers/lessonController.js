const { pool } = require('../config/db');
const { generateOTP } = require('../utils/otpGenerator');
const { sendSMS } = require('../utils/smsSender');

async function checkBookingCompletion(bookingId) {
  const result = await pool.query(
    `SELECT COUNT(*) AS total,
            COUNT(CASE WHEN status = 'confirmed_by_parent' THEN 1 END) AS confirmed
     FROM lessons WHERE booking_id = $1`,
    [bookingId]
  );

  const total = parseInt(result.rows[0].total, 10);
  const confirmed = parseInt(result.rows[0].confirmed, 10);

  if (total > 0 && total === confirmed) {
    await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['completed', bookingId]);
  }
}

exports.getParentChildren = async (req, res) => {
  const parentId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name AS name, u.email
       FROM users u
       JOIN bookings b ON b.child_id = u.id
       WHERE b.parent_id = $1
       GROUP BY u.id, u.full_name, u.email`,
      [parentId]
    );

    res.json({ children: result.rows });
  } catch (err) {
    console.error('Error fetching children:', err);
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};

exports.getParentPendingConfirmations = async (req, res) => {
  const parentId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT l.id AS lesson_id, l.booking_id, l.subject, l.scheduled_time, l.status,
              t.full_name AS teacher_name, t.phone AS teacher_phone
       FROM lessons l
       JOIN bookings b ON l.booking_id = b.id
       JOIN users t ON b.teacher_id = t.id
       WHERE b.parent_id = $1 AND l.status = 'completed_by_teacher'
       ORDER BY l.scheduled_time ASC`,
      [parentId]
    );

    res.json({ lessons: result.rows });
  } catch (err) {
    console.error('Error fetching pending confirmations:', err);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
};

exports.parentConfirmLesson = async (req, res) => {
  const parentId = req.user.id;
  const { lessonId } = req.params;
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ error: 'OTP is required to confirm lesson' });
  }

  try {
    const lessonResult = await pool.query(
      `SELECT l.*, b.parent_id, b.teacher_id, b.id AS booking_id
       FROM lessons l JOIN bookings b ON l.booking_id = b.id
       WHERE l.id = $1`,
      [lessonId]
    );

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const lesson = lessonResult.rows[0];
    if (lesson.parent_id !== parentId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (lesson.status !== 'completed_by_teacher') {
      return res.status(400).json({ error: 'Lesson is not ready for confirmation' });
    }

    if (!lesson.confirmation_otp || lesson.confirmation_otp !== otp || new Date() > lesson.otp_expiry) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await pool.query(
      `UPDATE lessons SET status = 'confirmed_by_parent', confirmed_at = NOW() WHERE id = $1`,
      [lessonId]
    );

    await checkBookingCompletion(lesson.booking_id);

    res.json({ message: 'Lesson confirmed successfully' });
  } catch (err) {
    console.error('Error confirming lesson:', err);
    res.status(500).json({ error: 'Failed to confirm lesson' });
  }
};

exports.teacherCompleteLesson = async (req, res) => {
  const teacherId = req.user.id;
  const { lessonId } = req.params;

  try {
    const lessonResult = await pool.query(
      `SELECT l.*, b.teacher_id, b.parent_id, p.phone AS parent_phone
       FROM lessons l
       JOIN bookings b ON l.booking_id = b.id
       JOIN users p ON b.parent_id = p.id
       WHERE l.id = $1 AND b.teacher_id = $2 AND l.status = 'scheduled'`,
      [lessonId, teacherId]
    );

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found or not scheduled' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await pool.query(
      `UPDATE lessons SET status = 'completed_by_teacher', confirmation_otp = $1, otp_expiry = $2 WHERE id = $3`,
      [otp, otpExpiry, lessonId]
    );

    await sendSMS(lessonResult.rows[0].parent_phone, `Your lesson OTP is ${otp} (valid 15 mins)`);

    res.json({ message: 'Lesson marked complete and OTP sent to parent' });
  } catch (err) {
    console.error('Error completing lesson:', err);
    res.status(500).json({ error: 'Failed to mark lesson complete' });
  }
};