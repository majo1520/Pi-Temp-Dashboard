// auth.js - Authentication middlewares
const logger = require('../utils/logger');

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Authentication middleware
function isAuthenticated(req, res, next) {
  // If in development and no user is in session, create a mock user
  if (isDevelopment && !req.session.user) {
    logger.log('DEV MODE: Creating mock user for development');
    req.session.user = {
      id: 'dev-user',
      username: 'developer',
      roles: ['admin', 'user'],
      email: 'dev@example.com'
    };
    next();
    return;
  }
  
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Admin role middleware
function isAdmin(req, res, next) {
  // If in development and no user is in session, create a mock admin user
  if (isDevelopment && !req.session.user) {
    logger.log('DEV MODE: Creating mock admin for development');
    req.session.user = {
      id: 'dev-admin',
      username: 'developer',
      roles: ['admin'],
      email: 'admin@example.com'
    };
    next();
    return;
  }
  
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Protect admin routes - redirect to login page if not authenticated
function protectAdminRoutes(req, res, next) {
  // If in development and no user is in session, create a mock admin user
  if (isDevelopment && !req.session.user) {
    logger.log('DEV MODE: Creating mock admin for development');
    req.session.user = {
      id: 'dev-admin',
      username: 'developer',
      roles: ['admin'],
      email: 'admin@example.com'
    };
    next();
    return;
  }
  
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