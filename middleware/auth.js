const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

module.exports = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('No token provided');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userSnapshot = await db.ref(`users/${decoded.id}`).once('value');

    if (!userSnapshot.exists()) throw new Error('User not found');

    const user = userSnapshot.val();
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Please authenticate', details: err.message });
  }
};
