// auth.js - Authentication middlewares
const logger = require('../utils/logger');

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Admin role middleware
function isAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Protect admin routes - redirect to login page if not authenticated
function protectAdminRoutes(req, res, next) {
  if (!req.session.user) {
    logger.log(`Unauthorized access attempt to admin area: ${req.path}`);
    return res.redirect('/login');
  }
  next();
}

module.exports = {
  isAuthenticated,
  isAdmin,
  protectAdminRoutes
}; 