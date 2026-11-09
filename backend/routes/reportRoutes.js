const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { createReport, getMyReports } = require('../controllers/reportController');

// Reporting is intentionally rate limited to curb queue flooding.
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many reports submitted. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/', protect, reportLimiter, createReport);
router.get('/mine', protect, getMyReports);

module.exports = router;
