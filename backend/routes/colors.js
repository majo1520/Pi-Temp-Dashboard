// colors.js - Routes for location colors
const express = require('express');
const router = express.Router();
const { locationColors } = require('../db.cjs');
const logger = require('../utils/logger');
const { isAuthenticated } = require('../middleware/auth');

// In-memory fallback for location colors
const inMemoryLocationColors = {
  // Default colors
  colors: {
    'IT OFFICE': '#3498db',
    'MARKETING': '#9b59b6',
    'IT SERVER ROOM': '#f39c12',
    'default': '#cccccc'
  },
  
  async getAll() {
    logger.log('Using in-memory fallback for location colors (getAll)');
    return this.colors;
  },
  
  async update(newColors) {
    logger.log('Using in-memory fallback for location colors (update)');
    // Merge new colors with existing ones
    this.colors = { ...this.colors, ...newColors };
    return { success: true, message: 'Location colors updated in memory' };
  }
};

// Wrapper for location colors with fallback
const locationColorsFallback = {
  getAll: async () => {
    try {
      // Try to use the database version first
      if (locationColors && typeof locationColors.getAll === 'function') {
        return await locationColors.getAll();
      } 
    } catch (err) {
      logger.error('Error in locationColors.getAll, using fallback:', err);
    }
    
    // Fall back to in-memory version
    return inMemoryLocationColors.getAll();
  },
  
  update: async (newColors) => {
    try {
      // Try to use the database version first
      if (locationColors && typeof locationColors.update === 'function') {
        return await locationColors.update(newColors);
      }
    } catch (err) {
      logger.error('Error in locationColors.update, using fallback:', err);
    }
    
    // Fall back to in-memory version
    return inMemoryLocationColors.update(newColors);
  }
};

// Get all location colors
router.get('/', async (req, res) => {
  try {
    const colors = await locationColorsFallback.getAll();
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
    // Log username if available, otherwise note it's guest mode
    const username = req.session?.user?.username || 'guest';
    const email = req.session?.user?.email || 'guest';
    
    logger.log(`User ${username} (${email}) updating location colors:`, newColors);
    const result = await locationColorsFallback.update(newColors);
    res.json(result);
  } catch (err) {
    logger.error("Error updating location colors:", err);
    res.status(500).json({ error: 'Failed to update location colors' });
  }
});

module.exports = router; 