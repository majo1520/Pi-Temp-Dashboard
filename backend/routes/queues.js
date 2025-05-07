/**
 * Queue Management Routes
 * 
 * This module provides API endpoints for monitoring and managing the message queues.
 * It supports both Redis-based queues and in-memory fallback queues.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Try to load the queue module
let sensorQueue;
try {
  sensorQueue = require('../queues/sensorDataQueue');
} catch (error) {
  logger.log('Message queue system not available for routes:', error.message);
}

// Get queue statistics
router.get('/stats', async (req, res) => {
  try {
    if (!sensorQueue) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Message queue system is not available'
      });
    }
    
    // Get stats directly from the queue module
    const stats = await sensorQueue.getQueueStats();
    
    if (!stats) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get queue statistics'
      });
    }
    
    // Format response
    res.json({
      queues: [
        {
          name: 'sensor-data-processing',
          counts: stats.sensor,
          mode: stats.sensor.mode || 'redis'
        },
        {
          name: 'sensor-alerts',
          counts: stats.alerts,
          mode: stats.alerts.mode || 'redis'
        },
        {
          name: 'data-aggregation',
          counts: stats.aggregation,
          mode: stats.aggregation.mode || 'redis'
        }
      ],
      queueSystem: {
        available: true,
        redisAvailable: sensorQueue.isRedisAvailable(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to get queue statistics',
      details: error.message
    });
  }
});

// Clear a queue
router.post('/clear/:queueName', async (req, res) => {
  try {
    if (!sensorQueue) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Message queue system is not available'
      });
    }
    
    const { queueName } = req.params;
    
    // Handle request based on queue type
    let success = false;
    const isRedisAvailable = sensorQueue.isRedisAvailable();
    
    if (isRedisAvailable) {
      // Select the queue to clear
      let queue;
      switch (queueName) {
        case 'sensor-data-processing':
          queue = sensorQueue.sensorDataQueue;
          break;
        case 'sensor-alerts':
          queue = sensorQueue.alertsQueue;
          break;
        case 'data-aggregation':
          queue = sensorQueue.aggregationQueue;
          break;
        default:
          return res.status(404).json({
            error: 'Not Found',
            message: `Queue '${queueName}' not found`
          });
      }
      
      if (!queue) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Queue '${queueName}' is not available`
        });
      }
      
      // Clear the queue
      await queue.empty();
      success = true;
    } else {
      // For in-memory queues, we don't have a direct way to clear them
      // This would require adding clear methods to the sensorQueue module
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Clearing in-memory queues is not supported yet'
      });
    }
    
    res.json({
      success,
      mode: isRedisAvailable ? 'redis' : 'memory',
      message: `Queue '${queueName}' has been cleared`
    });
  } catch (error) {
    logger.error(`Error clearing queue:`, error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to clear queue',
      details: error.message
    });
  }
});

// Pause a queue
router.post('/pause/:queueName', async (req, res) => {
  try {
    if (!sensorQueue) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Message queue system is not available'
      });
    }
    
    // Check if Redis is available
    if (!sensorQueue.isRedisAvailable()) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Pausing in-memory queues is not supported'
      });
    }
    
    const { queueName } = req.params;
    
    // Select the queue to pause
    let queue;
    switch (queueName) {
      case 'sensor-data-processing':
        queue = sensorQueue.sensorDataQueue;
        break;
      case 'sensor-alerts':
        queue = sensorQueue.alertsQueue;
        break;
      case 'data-aggregation':
        queue = sensorQueue.aggregationQueue;
        break;
      default:
        return res.status(404).json({
          error: 'Not Found',
          message: `Queue '${queueName}' not found`
        });
    }
    
    if (!queue) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Queue '${queueName}' is not available`
      });
    }
    
    // Pause the queue
    await queue.pause();
    
    res.json({
      success: true,
      message: `Queue '${queueName}' has been paused`
    });
  } catch (error) {
    logger.error(`Error pausing queue:`, error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to pause queue',
      details: error.message
    });
  }
});

// Resume a queue
router.post('/resume/:queueName', async (req, res) => {
  try {
    if (!sensorQueue) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Message queue system is not available'
      });
    }
    
    // Check if Redis is available
    if (!sensorQueue.isRedisAvailable()) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Resuming in-memory queues is not supported'
      });
    }
    
    const { queueName } = req.params;
    
    // Select the queue to resume
    let queue;
    switch (queueName) {
      case 'sensor-data-processing':
        queue = sensorQueue.sensorDataQueue;
        break;
      case 'sensor-alerts':
        queue = sensorQueue.alertsQueue;
        break;
      case 'data-aggregation':
        queue = sensorQueue.aggregationQueue;
        break;
      default:
        return res.status(404).json({
          error: 'Not Found',
          message: `Queue '${queueName}' not found`
        });
    }
    
    if (!queue) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Queue '${queueName}' is not available`
      });
    }
    
    // Resume the queue
    await queue.resume();
    
    res.json({
      success: true,
      message: `Queue '${queueName}' has been resumed`
    });
  } catch (error) {
    logger.error(`Error resuming queue:`, error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to resume queue',
      details: error.message
    });
  }
});

module.exports = router; 