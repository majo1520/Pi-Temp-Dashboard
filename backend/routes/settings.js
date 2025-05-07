// settings.js - User settings routes
const express = require('express');
const router = express.Router();
const { userSettings } = require('../db.cjs');
const { isAuthenticated } = require('../middleware/auth');
const logger = require('../utils/logger');

// Memory-based fallback for when user is not authenticated
const guestSettings = new Map();

// Get all settings for the logged in user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Check if user is available in session
    const userId = req.session?.user?.id || 'guest';
    
    if (userId === 'guest') {
      logger.log('No user in session, returning guest settings');
      // Return empty settings for guest users from memory
      const guestSettingsObj = {};
      guestSettings.forEach((value, key) => {
        guestSettingsObj[key] = value;
      });
      return res.json(guestSettingsObj);
    }
    
    const settings = await userSettings.getAll(userId);
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
    // Check if user is available in session
    const userId = req.session?.user?.id || 'guest';
    
    if (userId === 'guest') {
      // Get guest setting from memory
      const value = guestSettings.get(key) || null;
      if (value === null) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      return res.json({ [key]: value });
    }
    
    const value = await userSettings.get(userId, key);
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
    // Check if user is available in session
    const userId = req.session?.user?.id || 'guest';
    
    if (userId === 'guest') {
      // Store setting in memory for guest users
      guestSettings.set(key, value);
      return res.json({ success: true, key, value });
    }
    
    // Check if userSettings is defined before calling set
    if (!userSettings || typeof userSettings.set !== 'function') {
      logger.error(`Error: userSettings or userSettings.set is not defined when setting ${key}`);
      // Store in memory as a fallback
      guestSettings.set(key, value);
      return res.json({ success: true, key, value, warning: 'Stored in memory only' });
    }
    
    await userSettings.set(userId, key, value);
    res.json({ success: true, key, value });
  } catch (err) {
    logger.error(`Error setting user setting ${key}:`, err);
    // Try storing in memory as a last resort
    try {
      guestSettings.set(key, value);
      res.json({ success: true, key, value, warning: 'Stored in memory only due to database error' });
    } catch (memErr) {
      res.status(500).json({ error: 'Failed to save user setting' });
    }
  }
});

// Delete a specific setting
router.delete('/:key', isAuthenticated, async (req, res) => {
  const { key } = req.params;
  
  try {
    // Check if user is available in session
    const userId = req.session?.user?.id || 'guest';
    
    if (userId === 'guest') {
      // Delete setting from memory for guest users
      guestSettings.delete(key);
      return res.json({ success: true });
    }
    
    await userSettings.delete(userId, key);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Error deleting user setting ${key}:`, err);
    // Try deleting from memory as a fallback
    try {
      guestSettings.delete(key);
      res.json({ success: true, warning: 'Deleted from memory only' });
    } catch (memErr) {
      res.status(500).json({ error: 'Failed to delete user setting' });
    }
  }
});

module.exports = router; 