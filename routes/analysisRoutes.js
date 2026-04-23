const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');
const Business = require('../models/Business');

// GET /api/health - Status route to confirm server is running
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Market Opportunity Scout Server is running.' });
});

// GET /api/businesses - Fetch seeded business data
router.get('/businesses', async (req, res) => {
  try {
    const businesses = await Business.find({});
    res.status(200).json(businesses);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// POST /api/analyze - Core logic route for AI market analysis
router.post('/analyze', analysisController.analyzeMarket);

module.exports = router;
