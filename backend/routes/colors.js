// colors.js - Routes for location colors
const express = require('express');
const router = express.Router();
const { locationColors } = require('../db.cjs');
const logger = require('../utils/logger');
const { isAuthenticated } = require('../middleware/auth');

// Get all location colors
router.get('/', async (req, res) => {
  try {
    const colors = await locationColors.getAll();
    res.json(colors);
  } catch (err) {
    logger.error("Error fetching location colors:", err);
    res.status(500).json({ error: 'Failed to fetch location colors' });
  }
});

// Update location colors
router.post('/', isAuthenticated, async (req, res) => {
  const newColors = req.body;
  
  if (!newColors || typeof newColors !== 'object') {
    return res.status(400).json({ error: 'Invalid color data format' });
  }
  
  try {
    logger.log(`User ${req.session.user.username} (${req.session.user.email}) updating location colors:`, newColors);
    const result = await locationColors.update(newColors);
    res.json(result);
  } catch (err) {
    logger.error("Error updating location colors:", err);
    res.status(500).json({ error: 'Failed to update location colors' });
  }
});

module.exports = router; 