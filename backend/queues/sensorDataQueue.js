/**
 * Sensor Data Queue System
 * 
 * This module implements a message queue for processing high volumes of sensor data.
 * It uses Bull queue backed by Redis for reliable, distributed processing.
 * If Redis is unavailable, it fails gracefully with a memory-based fallback.
 */

const config = require('../config/config');
const logger = require('../utils/logger');

// Check if Redis is available
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';

// State tracking
let isRedisAvailable = false;
let hasLoggedRedisError = false;
let queuesInitialized = false;

// In-memory fallback queues
const inMemoryQueue = [];
const inMemoryAlertQueue = [];
const inMemoryAggregationQueue = [];
const MAX_MEMORY_QUEUE_SIZE = 1000; // Prevent memory leaks

// Queue instances
let Queue, sensorDataQueue, alertsQueue, aggregationQueue;

// Try to load Bull if Redis is enabled
if (CACHE_ENABLED) {
  try {
    Queue = require('bull');
    
    // Queue options with sensible defaults
    const queueOptions = {
      redis: REDIS_URL,
      defaultJobOptions: {
        attempts: 3,             // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',   // Exponential backoff strategy
          delay: 1000            // Starting delay of 1 second
        },
        removeOnComplete: 100,   // Keep last 100 completed jobs
        removeOnFail: 500        // Keep last 500 failed jobs for debugging
      }
    };

    // Create queues for different processing needs
    try {
      sensorDataQueue = new Queue('sensor-data-processing', queueOptions);
      alertsQueue = new Queue('sensor-alerts', queueOptions);
      aggregationQueue = new Queue('data-aggregation', queueOptions);
      isRedisAvailable = true;
      logger.log('Bull queue system initialized with Redis');
    } catch (error) {
      if (!hasLoggedRedisError) {
        logger.error('Failed to connect to Redis, using memory fallback:', error.message);
        hasLoggedRedisError = true;
      }
      isRedisAvailable = false;
    }
  } catch (error) {
    logger.error('Bull dependency not available:', error.message);
    isRedisAvailable = false;
  }
} else {
  logger.log('Redis cache disabled by configuration, using memory fallback');
  isRedisAvailable = false;
}

// Initialize the queues and their processors
function initializeQueues() {
  if (queuesInitialized) return;
  
  if (isRedisAvailable) {
    // Set up the main sensor data processing queue
    sensorDataQueue.process(async (job) => {
      try {
        logger.log(`Processing sensor data job ${job.id}: ${job.data.location}`);
        await processSensorData(job.data);
        return { success: true, jobId: job.id };
      } catch (error) {
        logger.error(`Error processing sensor data job ${job.id}:`, error);
        throw error; // Re-throw to trigger Bull's retry mechanism
      }
    });

    // Set up alerts queue
    alertsQueue.process(async (job) => {
      try {
        logger.log(`Processing alert job ${job.id} for ${job.data.location}`);
        await processAlert(job.data);
        return { success: true, jobId: job.id };
      } catch (error) {
        logger.error(`Error processing alert job ${job.id}:`, error);
        throw error;
      }
    });

    // Set up data aggregation queue
    aggregationQueue.process(async (job) => {
      try {
        logger.log(`Processing aggregation job ${job.id}`);
        await aggregateData(job.data);
        return { success: true, jobId: job.id };
      } catch (error) {
        logger.error(`Error processing aggregation job ${job.id}:`, error);
        throw error;
      }
    });

    // Set up event handlers for all queues
    setupQueueEventHandlers(sensorDataQueue, 'sensor-data');
    setupQueueEventHandlers(alertsQueue, 'alerts');
    setupQueueEventHandlers(aggregationQueue, 'aggregation');

    logger.log('Sensor data queuing system initialized');
  } else {
    // Set up memory-based fallback processing
    logger.log('Initializing in-memory fallback queues');
    
    // Start processing jobs from in-memory queues
    setInterval(processMemoryQueues, 1000);
  }
  
  queuesInitialized = true;
}

// Process jobs from in-memory queues
async function processMemoryQueues() {
  try {
    // Process sensor data queue
    if (inMemoryQueue.length > 0) {
      const job = inMemoryQueue.shift();
      try {
        logger.log(`Processing in-memory sensor data: ${job.location}`);
        await processSensorData(job);
      } catch (error) {
        logger.error('Error processing in-memory sensor data:', error);
      }
    }
    
    // Process alerts queue
    if (inMemoryAlertQueue.length > 0) {
      const job = inMemoryAlertQueue.shift();
      try {
        logger.log(`Processing in-memory alert: ${job.alertType} for ${job.location}`);
        await processAlert(job);
      } catch (error) {
        logger.error('Error processing in-memory alert:', error);
      }
    }
    
    // Process aggregation queue occasionally
    if (inMemoryAggregationQueue.length > 0 && Math.random() < 0.1) { // ~10% chance each interval
      const job = inMemoryAggregationQueue.shift();
      try {
        logger.log(`Processing in-memory aggregation: ${job.timeframe}`);
        await aggregateData(job);
      } catch (error) {
        logger.error('Error processing in-memory aggregation:', error);
      }
    }
  } catch (error) {
    logger.error('Error in memory queue processor:', error);
  }
}

// Common queue event handlers
function setupQueueEventHandlers(queue, name) {
  queue.on('completed', (job, result) => {
    logger.log(`${name} job ${job.id} completed successfully`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`${name} job ${job.id} failed:`, err);
  });

  queue.on('error', (error) => {
    if (!hasLoggedRedisError) {
      logger.error(`Error in ${name} queue:`, error);
      
      // Only log Redis connection errors once
      if (error.code === 'ECONNREFUSED') {
        hasLoggedRedisError = true;
      }
    }
  });

  // Monitor Redis reconnection
  queue.on('resumed', () => {
    logger.log(`${name} queue resumed`);
    isRedisAvailable = true;
  });
  
  // Graceful shutdown support
  process.on('SIGTERM', () => {
    logger.log(`Closing ${name} queue...`);
    queue.close();
  });
}

// Main function to process sensor data
async function processSensorData(data) {
  // Implementation will depend on your specific needs
  // This is a placeholder for the actual processing logic
  
  // Extract data components
  const { location, timestamp, measurements } = data;
  
  try {
    // Example: store data in InfluxDB
    // You would replace this with your actual storage logic
    // await storeInInfluxDB(location, timestamp, measurements);
    
    // Check for alert conditions
    if (shouldGenerateAlert(measurements)) {
      // Add to alerts queue
      const alertData = {
        location,
        timestamp,
        measurements,
        alertType: determineAlertType(measurements)
      };
      
      if (isRedisAvailable) {
        await alertsQueue.add(alertData);
      } else {
        // Add to in-memory alerts queue with size limit
        if (inMemoryAlertQueue.length < MAX_MEMORY_QUEUE_SIZE) {
          inMemoryAlertQueue.push(alertData);
        }
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`Error processing data for ${location}:`, error);
    throw error;
  }
}

// Process alerts
async function processAlert(data) {
  // Implementation for alert processing
  const { location, alertType, measurements } = data;
  
  try {
    // Example: Send notification, update status, etc.
    logger.log(`Alert triggered for ${location}: ${alertType}`);
    
    // Add implementation for notifications here
    // await sendNotification(location, alertType, measurements);
    
    return true;
  } catch (error) {
    logger.error(`Error processing alert for ${location}:`, error);
    throw error;
  }
}

// Aggregate data
async function aggregateData(data) {
  // Implementation for data aggregation
  const { timeframe, locations } = data;
  
  try {
    // Example: Calculate averages, generate reports, etc.
    logger.log(`Aggregating data for ${timeframe} across ${locations === 'all' ? 'all locations' : locations.length + ' locations'}`);
    
    // Add implementation for aggregation here
    // await generateAggregations(timeframe, locations);
    
    return true;
  } catch (error) {
    logger.error(`Error aggregating data:`, error);
    throw error;
  }
}

// Helper function to determine if measurements should trigger an alert
function shouldGenerateAlert(measurements) {
  // Implement your alert logic here
  // Example: temperature above/below threshold
  if (!measurements) return false;
  
  const { teplota, vlhkost, tlak } = measurements;
  
  // Example thresholds (adjust according to your needs)
  const tempThresholdHigh = 30; // °C
  const tempThresholdLow = 5;   // °C
  const humidityThresholdHigh = 80; // %
  
  return (
    (teplota && (teplota > tempThresholdHigh || teplota < tempThresholdLow)) ||
    (vlhkost && vlhkost > humidityThresholdHigh)
  );
}

// Helper function to determine alert type
function determineAlertType(measurements) {
  if (!measurements) return 'unknown';
  
  const { teplota, vlhkost, tlak } = measurements;
  
  if (teplota && teplota > 30) return 'high-temperature';
  if (teplota && teplota < 5) return 'low-temperature';
  if (vlhkost && vlhkost > 80) return 'high-humidity';
  
  return 'general';
}

// Interface for adding new jobs to the queue
async function addSensorDataJob(data) {
  if (!data) return null;
  
  try {
    if (isRedisAvailable) {
      return await sensorDataQueue.add(data);
    } else {
      // Use in-memory queue with size limit to prevent memory leaks
      if (inMemoryQueue.length < MAX_MEMORY_QUEUE_SIZE) {
        inMemoryQueue.push(data);
        return { id: `memory-${Date.now()}`, data };
      } else {
        logger.error('In-memory queue full, dropping job');
        return null;
      }
    }
  } catch (error) {
    // If Redis connection failed, fall back to in-memory queue
    logger.error('Error adding job to Redis queue, using memory fallback:', error.message);
    isRedisAvailable = false;
    
    if (inMemoryQueue.length < MAX_MEMORY_QUEUE_SIZE) {
      inMemoryQueue.push(data);
      return { id: `memory-${Date.now()}`, data };
    } else {
      logger.error('In-memory queue full, dropping job');
      return null;
    }
  }
}

// Schedule periodic aggregation jobs
function scheduleAggregationJobs() {
  if (isRedisAvailable) {
    try {
      // Schedule hourly aggregation
      aggregationQueue.add(
        { timeframe: 'hourly', locations: 'all' },
        { repeat: { cron: '0 * * * *' } }
      );
      
      // Schedule daily aggregation
      aggregationQueue.add(
        { timeframe: 'daily', locations: 'all' },
        { repeat: { cron: '0 0 * * *' } }
      );
      
      logger.log('Scheduled periodic aggregation jobs');
    } catch (error) {
      logger.error('Failed to schedule aggregation jobs:', error);
    }
  } else {
    // For in-memory fallback, we'll just add one job to the queue that will be processed 
    // periodically in the memory queue processor
    inMemoryAggregationQueue.push({ timeframe: 'periodic', locations: 'all' });
    logger.log('Added fallback aggregation job to in-memory queue');
  }
}

// Get queue statistics
async function getQueueStats() {
  if (isRedisAvailable) {
    try {
      const stats = {
        sensor: {
          waiting: await sensorDataQueue.getWaitingCount(),
          active: await sensorDataQueue.getActiveCount(),
          completed: await sensorDataQueue.getCompletedCount(),
          failed: await sensorDataQueue.getFailedCount()
        },
        alerts: {
          waiting: await alertsQueue.getWaitingCount(),
          active: await alertsQueue.getActiveCount(),
          completed: await alertsQueue.getCompletedCount(),
          failed: await alertsQueue.getFailedCount()
        },
        aggregation: {
          waiting: await aggregationQueue.getWaitingCount(),
          active: await aggregationQueue.getActiveCount(),
          completed: await aggregationQueue.getCompletedCount(),
          failed: await aggregationQueue.getFailedCount()
        }
      };
      return stats;
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      return null;
    }
  } else {
    // Return in-memory queue stats
    return {
      sensor: {
        waiting: inMemoryQueue.length,
        active: 0,
        completed: 0,
        failed: 0,
        mode: 'memory-fallback'
      },
      alerts: {
        waiting: inMemoryAlertQueue.length,
        active: 0,
        completed: 0,
        failed: 0,
        mode: 'memory-fallback'
      },
      aggregation: {
        waiting: inMemoryAggregationQueue.length,
        active: 0,
        completed: 0,
        failed: 0,
        mode: 'memory-fallback'
      }
    };
  }
}

// Export queue functions and objects
module.exports = {
  initializeQueues,
  addSensorDataJob,
  scheduleAggregationJobs,
  getQueueStats,
  isRedisAvailable: () => isRedisAvailable,
  // Export the actual queue objects if available, otherwise null
  sensorDataQueue: isRedisAvailable ? sensorDataQueue : null,
  alertsQueue: isRedisAvailable ? alertsQueue : null,
  aggregationQueue: isRedisAvailable ? aggregationQueue : null
}; 