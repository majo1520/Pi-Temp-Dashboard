/**
 * Load Balancing with Node.js Cluster
 * 
 * This module creates a cluster of worker processes to utilize all available CPU cores.
 * Each worker runs an instance of the server, allowing Node.js to distribute the load.
 */

const cluster = require('cluster');
const os = require('os');
const path = require('path');

// Get number of CPU cores
const numCPUs = os.cpus().length;

// Import logger, modified to handle cluster workers
const logger = require('./utils/logger');

// Configure cluster settings
cluster.schedulingPolicy = cluster.SCHED_RR; // Round-robin scheduling

// Function to start the cluster
function startCluster() {
  if (cluster.isPrimary) {
    logger.always(`Master process ${process.pid} is running`);
    logger.always(`Starting ${numCPUs} worker processes...`);

    // Stats to track worker restarts
    let restartCount = 0;
    const workerRestartsMap = new Map();

    // Initialize cache sharing if using Redis
    initializeSharedCache();

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    // Listen for dying workers and restart them
    cluster.on('exit', (worker, code, signal) => {
      const workerId = worker.id;
      const restarts = workerRestartsMap.get(workerId) || 0;
      
      // Check if this worker has been restarting too frequently
      if (restarts > 5) {
        logger.error(`Worker ${worker.process.pid} has crashed too many times (${restarts}). Not restarting.`);
        return;
      }
      
      // Update restart stats
      workerRestartsMap.set(workerId, restarts + 1);
      restartCount++;
      
      logger.error(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
      logger.log(`Worker restarts: ${restartCount}`);
      
      // Fork a new worker
      const newWorker = cluster.fork();
      logger.log(`Started new worker ${newWorker.process.pid}`);
      
      // Reset restart count after 10 minutes
      setTimeout(() => {
        if (workerRestartsMap.has(workerId)) {
          workerRestartsMap.set(workerId, Math.max(0, workerRestartsMap.get(workerId) - 1));
        }
      }, 10 * 60 * 1000);
    });

    // Add monitoring console
    monitorCluster();
  } else {
    // Workers run the actual server
    logger.log(`Worker ${process.pid} started`);
    require('./server.cjs');
  }
}

// Initialize shared cache for workers
function initializeSharedCache() {
  try {
    // Only attempt to initialize Redis if it's enabled in config
    const config = require('./config/config');
    if (config.CACHE_ENABLED === 'true' && config.REDIS_URL) {
      logger.log('Initializing shared Redis cache for worker processes');
    }
  } catch (error) {
    logger.error('Error initializing shared cache:', error);
  }
}

// Add basic monitoring
function monitorCluster() {
  // Log stats every 5 minutes
  setInterval(() => {
    const workers = Object.values(cluster.workers);
    logger.log(`Cluster status: ${workers.length} active workers`);
    
    // Memory usage statistics
    const memUsage = process.memoryUsage();
    logger.log(`Master memory usage: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
  }, 5 * 60 * 1000);
}

// Start the cluster
startCluster();

// Handle termination signals
process.on('SIGINT', () => {
  logger.always('Cluster shutting down...');
  
  // Kill all workers gracefully
  for (const id in cluster.workers) {
    cluster.workers[id].kill();
  }
  
  // Exit master process
  process.exit(0);
});

module.exports = { startCluster }; 