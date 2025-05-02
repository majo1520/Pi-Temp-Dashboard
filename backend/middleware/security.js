// security.js - Security middleware
const csrf = require('csurf');
const xss = require('xss');

// CSRF Protection for state-changing endpoints
const csrfProtection = csrf({ cookie: false }); // Using session for CSRF tokens

// Validate and sanitize input function
function sanitizeInput(input) {
  if (typeof input === 'string') {
    return xss(input.trim());
  }
  return input;
}

// Input validation middleware
function validateInput(req, res, next) {
  // Sanitize body parameters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      req.body[key] = sanitizeInput(req.body[key]);
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      req.query[key] = sanitizeInput(req.query[key]);
    });
  }
  
  next();
}

module.exports = {
  csrfProtection,
  sanitizeInput,
  validateInput
}; 