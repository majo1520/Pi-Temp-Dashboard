// settings.js - User settings routes
const express = require('express');
const router = express.Router();
const { userSettings } = require('../db.cjs');
const { isAuthenticated } = require('../middleware/auth');
const logger = require('../utils/logger');

// Get all settings for the logged in user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const settings = await userSettings.getAll(req.session.user.id);
    res.json(settings);
  } catch (err) {
    logger.error('Error fetching user settings:', err);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// Get a specific setting
router.get('/:key', isAuthenticated, async (req, res) => {
  const { key } = req.params;
  
  try {
    const value = await userSettings.get(req.session.user.id, key);
    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ [key]: value });
  } catch (err) {
    logger.error(`Error fetching user setting ${key}:`, err);
    res.status(500).json({ error: 'Failed to fetch user setting' });
  }
});

// Set a specific setting
router.post('/:key', isAuthenticated, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  
  if (value === undefined) {
    return res.status(400).json({ error: 'Missing value parameter' });
  }
  
  try {
    // Check if userSettings is defined before calling set
    if (!userSettings || typeof userSettings.set !== 'function') {
      logger.error(`Error: userSettings or userSettings.set is not defined when setting ${key}`);
      return res.status(500).json({ error: 'Database module not properly initialized' });
    }
    
    await userSettings.set(req.session.user.id, key, value);
    res.json({ success: true, key, value });
  } catch (err) {
    logger.error(`Error setting user setting ${key}:`, err);
    res.status(500).json({ error: 'Failed to save user setting' });
  }
});

// Delete a specific setting
router.delete('/:key', isAuthenticated, async (req, res) => {
  const { key } = req.params;
  
  try {
    await userSettings.delete(req.session.user.id, key);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Error deleting user setting ${key}:`, err);
    res.status(500).json({ error: 'Failed to delete user setting' });
  }
});

module.exports = router; 