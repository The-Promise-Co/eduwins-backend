const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createReport, getReports } = require('../controllers/progressReportController');

router.post('/', authMiddleware, createReport);
router.get('/my', authMiddleware, getReports);

module.exports = router;
