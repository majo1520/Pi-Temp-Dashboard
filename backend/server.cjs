// server.cjs - Main server file
/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       required:
 *         - error
 *         - message
 *       properties:
 *         error:
 *           type: string
 *           description: Error title
 *         message:
 *           type: string
 *           description: Detailed error message
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cluster = require('cluster');

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
const mqttRoutes = require('./routes/mqtt');

// Import Swagger documentation
const swagger = require('./swagger');

// Import message queue system (may be undefined if Redis unavailable)
let sensorQueue;
try {
  sensorQueue = require('./queues/sensorDataQueue');
  logger.info('Message queue system available');
} catch (error) {
  logger.info('Message queue system not available:', error.message);
  logger.info('To enable queuing, ensure Redis is running and accessible');
}

// Import Apollo Server for GraphQL
let ApolloServer;
let expressMiddleware;
let gql;
let schema;
let graphqlEnabled = false;

// Dynamically import Apollo Server to avoid dependency issues if not installed
try {
  const apollo = require('apollo-server-express');
  ApolloServer = apollo.ApolloServer;
  expressMiddleware = apollo.expressMiddleware;
  gql = apollo.gql;
  
  // Import GraphQL schema 
  schema = require('./graphql/schema');
  
  graphqlEnabled = true;
  logger.info('GraphQL support enabled');
} catch (error) {
  logger.info('Apollo Server not available, GraphQL support disabled:', error.message);
  logger.info('To enable GraphQL, install: npm install apollo-server-express graphql --save');
}

// Check if we're running in cluster mode
const CLUSTER_MODE = process.env.CLUSTER_MODE === 'true';

// If in cluster mode and this is the master process, delegate to cluster.js
if (CLUSTER_MODE && cluster.isPrimary) {
  logger.info('Starting in cluster mode...');
  require('./cluster');
  return;
}

// Initialize Express app
const app = express();

// Show startup environment information
logger.info(`Server starting in ${process.env.NODE_ENV || 'development'} mode${CLUSTER_MODE ? ' (clustered)' : ''}`);
logger.info(`Process ID: ${process.pid}`);
logger.info(`Logging level: ${process.env.LOG_LEVEL || 'default'}`);

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

// Setup Swagger documentation
swagger.setup(app);

// API Routes
app.use('/api', apiRoutes);

// MQTT Routes for sensor data
app.use('/api/mqtt', mqttRoutes);

// Initialize the message queue system if available
if (sensorQueue) {
  try {
    sensorQueue.initializeQueues();
    sensorQueue.scheduleAggregationJobs();
    logger.info('Sensor data queuing system initialized');
  } catch (error) {
    logger.error('Failed to initialize queue system:', error);
  }
}

// Setup GraphQL Apollo Server if available
async function setupGraphQL() {
  if (graphqlEnabled) {
    try {
      // Create an Apollo Server instance
      const server = new ApolloServer({
        typeDefs: schema.typeDefs,
        resolvers: schema.resolvers,
        introspection: true, // Enable introspection for development
        context: ({ req }) => ({
          user: req.session?.user || null,
          isAuthenticated: !!req.session?.user
        })
      });
      
      // Start the Apollo server
      await server.start();
      
      // Apply the Apollo middleware to Express
      app.use('/graphql', expressMiddleware(server, {
        context: async ({ req }) => ({
          user: req.session?.user || null,
          isAuthenticated: !!req.session?.user
        })
      }));
      
      logger.info(`GraphQL API available at http://localhost:${PORT}/graphql`);
    } catch (error) {
      logger.error('Failed to set up GraphQL:', error);
      graphqlEnabled = false;
    }
  }
}

// Protect admin routes
app.use(/^\/admin($|\/)/, protectAdminRoutes);

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
  logger.info('Async components initialized');
}).catch(err => {
  logger.error('Failed to initialize async components:', err);
});

// ================== SERVER STARTUP ==================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', async () => {
  const workerMessage = CLUSTER_MODE ? ` (Worker ${cluster.worker?.id || 'unknown'})` : '';
  logger.info(`Server running on port ${PORT}${workerMessage}`);
  logger.info(`API documentation available at http://localhost:${PORT}/api/docs`);
  
  // Set up GraphQL after the server is running
  await setupGraphQL();
});

// Keep the process alive
process.stdin.resume();

// Clean up on exit
process.on('SIGINT', () => {
  logger.info('Server shutting down...');
  
  // Close message queues if active
  if (sensorQueue) {
    try {
      // Close isn't actually exposed yet, but would be here
      logger.info('Closing message queues...');
    } catch (err) {
      logger.error('Error closing queues:', err);
    }
  }
  
  closeDatabase().then(() => {
    logger.info('Database closed');
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