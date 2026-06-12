const express = require('express');
const router = express.Router();
const { getAllReviews, getReviewById, getStats } = require('../db');

// GET /api/reviews — list all reviewed PRs
router.get('/', (req, res) => {
  try {
    const reviews = getAllReviews();
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reviews/stats — dashboard stats
router.get('/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reviews/:id — single PR with all comments
router.get('/:id', (req, res) => {
  try {
    const review = getReviewById(req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    res.json({ success: true, data: review });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
