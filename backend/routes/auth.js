// auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const { users } = require('../db.cjs');
const logger = require('../utils/logger');

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email/username and password are required' 
    });
  }
  
  try {
    // First check if user exists, regardless of active status
    let user = await users.getUserByCredentials(username);
    
    // If user exists but is inactive
    if (user && user.active === 0) {
      return res.status(403).json({
        success: false,
        error: 'account_disabled',
        message: 'Your account has been disabled. Please contact an administrator.'
      });
    }
    
    // Now authenticate (will also check active status)
    user = await users.authenticate(username, password);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Please check your email/username and password and try again.' 
      });
    }
    
    // Update session with user info
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles
    };
    
    // Return user data
    return res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (err) {
    logger.error("Login error:", err);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error. Please try again later.' 
    });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Failed to log out' });
      }
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

// Get session info
router.get('/session', (req, res) => {
  if (req.session.user) {
    return res.json({ 
      loggedIn: true, 
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        email: req.session.user.email,
        roles: req.session.user.roles
      } 
    });
  }
  res.json({ loggedIn: false });
});

module.exports = router; 