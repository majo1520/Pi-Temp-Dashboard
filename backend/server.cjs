// server.cjs - Main server file
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Import configuration
const config = require('./config/config');

// Import utilities and services
const logger = require('./utils/logger');
const { initializeAsyncComponents } = require('./services/asyncServices');
const { closeDatabase } = require('./db.cjs');

// Import middleware
const { validateInput } = require('./middleware/security');
const { protectAdminRoutes } = require('./middleware/auth');

// Import routes
const apiRoutes = require('./routes');

// Initialize Express app
const app = express();

// Show startup environment information
logger.always(`Server starting in ${process.env.NODE_ENV || 'development'} mode`);
logger.always(`Logging level: ${logger.level}`);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS with proper configuration - must be before Helmet
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in whitelist or is an IP address in your network
    if (config.CORS_ALLOWED_ORIGINS.indexOf(origin) !== -1 || 
        /^http:\/\/192\.168\.155\./.test(origin) || 
        /^http:\/\/localhost/.test(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,  // Disable CSP in development
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  xssFilter: true,
  hsts: false  // Disable HSTS in development
}));

// Enable Gzip compression
app.use(compression());

// Setup session with secure settings
app.use(session({
  secret: config.SESSION_SECRET,
  resave: true, 
  saveUninitialized: true, 
  cookie: {
    secure: false, // set to false for HTTP development
    httpOnly: true,
    maxAge: config.SESSION_MAX_AGE,
    sameSite: 'lax',  // Changed from 'strict' to 'lax' for better compatibility
    path: '/'  // Ensure cookie is available for the entire domain
  },
  name: 'dashboard.sid' // Custom name for the session cookie
}));

// Rate limiting for API routes
if (config.ENABLE_RATE_LIMITING) {
  const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW * 60 * 1000, // minutes to milliseconds
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', apiLimiter);
}

// Apply input validation to all routes
app.use(validateInput);

// Serve static files
const staticPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(staticPath));

// Protect admin routes
app.use(/^\/admin($|\/)/, protectAdminRoutes);

// API Routes
app.use('/api', apiRoutes);

// Serve index.html for all non-API routes
app.use('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Not Found', 
      message: 'The requested API endpoint does not exist'
    });
  }
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Initialize async components
initializeAsyncComponents().then(() => {
  logger.log('Async components initialized');
}).catch(err => {
  logger.error('Failed to initialize async components:', err);
});

// ================== SERVER STARTUP ==================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.always(`Server running on port ${PORT}`);
});

// Keep the process alive
process.stdin.resume();

// Clean up on exit
process.on('SIGINT', () => {
  logger.always('Server shutting down...');
  closeDatabase().then(() => {
    logger.always('Database closed');
    process.exit(0);
  }).catch(err => {
    logger.error('Error closing database:', err);
    process.exit(1);
  });
});

// Add a global error handler for unhandled exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit - just log the error
});

// Export app for testing purposes
module.exports = app;