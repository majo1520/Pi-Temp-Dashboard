// users.js - Routes for user management
const express = require('express');
const router = express.Router();
const { users, resetUserPassword } = require('../db.cjs');
const logger = require('../utils/logger');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Get current logged in user
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    id: req.session.user.id,
    username: req.session.user.username,
    email: req.session.user.email,
    roles: req.session.user.roles
  });
});

// List all users (admin only)
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userList = await users.list();
    res.json(userList);
  } catch (err) {
    logger.error("Error listing users:", err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create a new user (admin only)
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  const { username, password, email, roles } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const newUser = await users.create({ username, password, email, roles });
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      roles: newUser.roles
    });
  } catch (err) {
    logger.error("Error creating user:", err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update a user (admin only)
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, email, active, roles } = req.body;
  
  try {
    // Prevent self-deactivation or self-role removal
    if (parseInt(id) === req.session.user.id) {
      if (active === false) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }
      
      if (Array.isArray(roles) && !roles.includes('admin')) {
        return res.status(400).json({ error: 'Cannot remove admin role from your own account' });
      }
    }
    
    const updatedUser = await users.update(parseInt(id), { username, email, active, roles });
    
    // If updating self, update session
    if (parseInt(id) === req.session.user.id) {
      req.session.user = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        roles: updatedUser.roles
      };
    }
    
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      active: updatedUser.active,
      roles: updatedUser.roles
    });
  } catch (err) {
    logger.error("Error updating user:", err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete a user (admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  
  // Prevent self-deletion
  if (parseInt(id) === req.session.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  try {
    const result = await users.delete(parseInt(id));
    res.json(result);
  } catch (err) {
    logger.error("Error deleting user:", err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset user password (admin only)
router.post('/:id/reset-password', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  
  logger.log(`Password reset attempt for user ID ${id} by admin ${req.session.user.username} (ID: ${req.session.user.id})`);
  
  if (!newPassword) {
    logger.error('Password reset failed: No password provided');
    return res.status(400).json({ error: 'New password is required' });
  }
  
  if (newPassword.length < 8) {
    logger.error('Password reset failed: Password too short');
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  
  // Use the resetUserPassword function with Promise handling
  resetUserPassword(parseInt(id), newPassword)
    .then(result => {
      logger.log(`Password reset successful for user ID ${id}`);
      return res.json(result);
    })
    .catch(error => {
      logger.error(`Password reset function error: ${error.message}`);
      return res.status(500).json({ error: error.message || 'Failed to reset password' });
    });
});

module.exports = router; 