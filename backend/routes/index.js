// routes/index.js - Main router file
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const settingsRoutes = require('./settings');
const sensorsRoutes = require('./sensors');
const exportRoutes = require('./export');
const importRoutes = require('./import');
const colorsRoutes = require('./colors');
const usersRoutes = require('./users');
const telegramRoutes = require('./telegram');

// Register route modules
router.use('/', authRoutes); // auth routes don't have a prefix
router.use('/user-settings', settingsRoutes);
router.use('/sensors', sensorsRoutes);
router.use('/export', exportRoutes);
router.use('/import', importRoutes);
router.use('/location-colors', colorsRoutes);
router.use('/users', usersRoutes);
router.use('/notifications/telegram', telegramRoutes);
router.use('/telegram', telegramRoutes); // For backward compatibility

// Catch-all route for unmatched API endpoints
router.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: 'The requested API endpoint does not exist'
  });
});

module.exports = router; 