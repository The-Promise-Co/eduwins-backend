const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getParentChildren,
  getParentPendingConfirmations,
  parentConfirmLesson,
  teacherCompleteLesson,
} = require('../controllers/lessonController');

router.get('/parent/children', auth, getParentChildren);
router.get('/parent/pending', auth, getParentPendingConfirmations);
router.post('/:lessonId/confirm', auth, parentConfirmLesson);
router.post('/:lessonId/complete', auth, teacherCompleteLesson);

module.exports = router;