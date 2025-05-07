/**
 * Admin Monitoring API Routes
 * 
 * This module provides API endpoints for monitoring system health,
 * viewing metrics, and accessing tracing information.
 * These endpoints are restricted to admin users only.
 */

const express = require('express');
const router = express.Router();
const os = require('os');
const { isAdmin } = require('../../middleware/auth');
const metrics = require('../../monitoring/metrics');
const logger = require('../../utils/logger');
const diskHealth = require('../../utils/diskHealth');

// Try to import sensorQueue for monitoring queue status
let sensorQueue;
try {
  sensorQueue = require('../../queues/sensorDataQueue');
} catch (error) {
  logger.info('Queue monitoring unavailable:', error.message);
}

// Try to import cache module for cache stats
let cache;
try {
  cache = require('../../cache.cjs');
} catch (error) {
  logger.info('Cache monitoring unavailable:', error.message);
}

// Apply admin middleware to all routes
router.use(isAdmin);

// Apply response time tracking middleware
router.use(metrics.responseTimeMiddleware);

/**
 * @route GET /api/admin/monitoring/metrics
 * @desc Get Prometheus-compatible metrics
 * @access Admin
 */
router.get('/metrics', async (req, res) => {
  try {
    // Since we're using a mock implementation, just return a simple response
    res.set('Content-Type', 'text/plain');
    res.send('# Prometheus metrics collection is disabled\n# Install prom-client package to enable metrics collection');
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * @route GET /api/admin/monitoring/system
 * @desc Get system health information
 * @access Admin
 */
router.get('/system', async (req, res) => {
  try {
    // Get enhanced system metrics from our implementation
    const systemInfo = metrics.getSystemMetrics();
    
    // Return the full enhanced metrics object
    res.json(systemInfo);
  } catch (error) {
    logger.error('Error fetching system info:', error);
    res.status(500).json({ error: 'Failed to fetch system information' });
  }
});

/**
 * @route GET /api/admin/monitoring/queues
 * @desc Get queue status information
 * @access Admin
 */
router.get('/queues', async (req, res) => {
  try {
    if (!sensorQueue) {
      return res.status(503).json({
        error: 'Queue system unavailable',
        message: 'The queue system is not currently available'
      });
    }
    
    // Get queue statistics
    const stats = await sensorQueue.getQueueStats();
    
    // Enhance with additional information
    const queueInfo = {
      stats,
      isRedisAvailable: typeof sensorQueue.isRedisAvailable === 'function' 
        ? sensorQueue.isRedisAvailable() 
        : false,
      mode: typeof sensorQueue.isRedisAvailable === 'function' && sensorQueue.isRedisAvailable()
        ? 'redis'
        : 'memory',
      timestamp: new Date().toISOString()
    };
    
    res.json(queueInfo);
  } catch (error) {
    logger.error('Error fetching queue info:', error);
    res.status(500).json({ error: 'Failed to fetch queue information' });
  }
});

/**
 * @route GET /api/admin/monitoring/cache
 * @desc Get cache status information
 * @access Admin
 */
router.get('/cache', async (req, res) => {
  try {
    if (!cache) {
      return res.status(503).json({
        error: 'Cache system unavailable',
        message: 'The cache system is not currently available'
      });
    }
    
    // Get cache statistics
    const stats = await cache.getStats();
    
    // Get some sample keys for inspection
    const keys = await cache.getKeys('*');
    const sampleKeys = keys.slice(0, 10); // Just take first 10 to avoid overwhelming response
    
    // Enhanced cache info
    const cacheInfo = {
      stats,
      keyCount: keys.length,
      sampleKeys,
      timestamp: new Date().toISOString()
    };
    
    res.json(cacheInfo);
  } catch (error) {
    logger.error('Error fetching cache info:', error);
    res.status(500).json({ 
      error: 'Failed to fetch cache information',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/monitoring/health
 * @desc Get overall system health status
 * @access Admin
 */
router.get('/health', async (req, res) => {
  try {
    // Get system metrics for detailed health evaluation
    const systemMetrics = metrics.getSystemMetrics();
    
    // Try to get disk health info
    let diskHealthInfo;
    try {
      diskHealthInfo = await diskHealth.getDiskHealth();
    } catch (diskError) {
      logger.warn('Could not get disk health info:', diskError.message);
    }
    
    // Initialize checks array and default status
    const checks = [];
    let overallStatus = 'healthy';
    
    // Check memory usage - more detailed
    const memoryCheck = {
      name: 'Memory Usage',
      status: 'healthy',
      details: {
        total: systemMetrics.memory.total,
        totalFormatted: systemMetrics.memory.totalFormatted,
        free: systemMetrics.memory.free,
        freeFormatted: systemMetrics.memory.freeFormatted,
        used: systemMetrics.memory.used,
        usedFormatted: systemMetrics.memory.usedFormatted,
        utilizationPercent: systemMetrics.memory.utilizationPercent,
        threshold: {
          warning: 80,
          critical: 95
        }
      }
    };
    
    const memoryUsagePercent = parseFloat(systemMetrics.memory.utilizationPercent);
    if (memoryUsagePercent > 80) {
      memoryCheck.status = 'warning';
      overallStatus = 'degraded';
    }
    if (memoryUsagePercent > 95) {
      memoryCheck.status = 'critical';
      overallStatus = 'critical';
    }
    
    checks.push(memoryCheck);
    
    // Check CPU load - more detailed
    const cpuCheck = {
      name: 'CPU Load',
      status: 'healthy',
      details: {
        cores: systemMetrics.cpu.cores,
        model: systemMetrics.cpu.model,
        currentUsage: systemMetrics.cpu.utilizationPercent + '%',
        loadAvg1min: systemMetrics.cpu.loadAvg1min,
        loadAvg5min: systemMetrics.cpu.loadAvg5min,
        loadAvg15min: systemMetrics.cpu.loadAvg15min,
        threshold: {
          warning: systemMetrics.cpu.cores, // Warning if load exceeds # of cores
          critical: systemMetrics.cpu.cores * 2  // Critical if load exceeds 2x # of cores
        }
      }
    };
    
    // Check overall CPU usage
    const cpuUsage = parseFloat(systemMetrics.cpu.utilizationPercent);
    if (cpuUsage > 80) {
      cpuCheck.status = 'warning';
      overallStatus = overallStatus === 'critical' ? 'critical' : 'degraded';
    }
    if (cpuUsage > 95) {
      cpuCheck.status = 'critical';
      overallStatus = 'critical';
    }
    
    // Also check load average
    if (systemMetrics.cpu.loadAvg1min > systemMetrics.cpu.cores) {
      cpuCheck.status = cpuCheck.status === 'critical' ? 'critical' : 'warning';
      overallStatus = overallStatus === 'critical' ? 'critical' : 'degraded';
    }
    if (systemMetrics.cpu.loadAvg1min > systemMetrics.cpu.cores * 2) {
      cpuCheck.status = 'critical';
      overallStatus = 'critical';
    }
    
    checks.push(cpuCheck);
    
    // Check system uptime
    const uptimeCheck = {
      name: 'System Uptime',
      status: 'healthy',
      details: {
        system: systemMetrics.uptime.system,
        systemFormatted: systemMetrics.uptime.systemFormatted,
        process: systemMetrics.uptime.process,
        processFormatted: systemMetrics.uptime.processFormatted
      }
    };
    
    // Process uptime check - warning if process uptime is less than 10 minutes
    // (indicates frequent restarts)
    if (systemMetrics.uptime.process < 600) {
      uptimeCheck.status = 'warning';
      uptimeCheck.message = 'Process has recently restarted';
      overallStatus = overallStatus === 'critical' ? 'critical' : 'degraded';
    }
    
    checks.push(uptimeCheck);
    
    // Add disk health check if available
    if (diskHealthInfo) {
      const diskCheck = {
        name: 'Disk Health',
        status: 'healthy',
        details: {
          totalSize: diskHealthInfo.summary.totalSizeFormatted,
          used: diskHealthInfo.summary.totalUsedFormatted,
          available: diskHealthInfo.summary.totalAvailableFormatted,
          utilizationPercent: diskHealthInfo.summary.averageCapacity,
          diskCount: diskHealthInfo.summary.diskCount,
          threshold: {
            warning: 85,
            critical: 95
          }
        }
      };
      
      // Check disk capacity
      const avgDiskUsage = parseFloat(diskHealthInfo.summary.averageCapacity);
      if (avgDiskUsage > 85) {
        diskCheck.status = 'warning';
        diskCheck.message = 'Disk usage is high';
        overallStatus = overallStatus === 'critical' ? 'critical' : 'degraded';
      }
      if (avgDiskUsage > 95) {
        diskCheck.status = 'critical';
        diskCheck.message = 'Disk usage is critically high';
        overallStatus = 'critical';
      }
      
      // Check if any disk is over 95% full
      const criticalDisks = diskHealthInfo.disks.filter(disk => 
        parseFloat(disk.capacity) > 95
      );
      
      if (criticalDisks.length > 0) {
        diskCheck.status = 'critical';
        diskCheck.message = `${criticalDisks.length} disk(s) are critically full`;
        diskCheck.criticalDisks = criticalDisks.map(disk => ({
          filesystem: disk.filesystem,
          mounted: disk.mounted,
          capacity: disk.capacity + '%'
        }));
        overallStatus = 'critical';
      }
      
      // Check SMART health status if available
      const smartResults = diskHealthInfo.raw.smartInfo || [];
      const failedDisks = smartResults.filter(disk => 
        disk.health !== 'PASSED' && disk.health !== 'OK'
      );
      
      if (failedDisks.length > 0) {
        diskCheck.status = 'critical';
        diskCheck.message = `${failedDisks.length} disk(s) failed SMART health check`;
        diskCheck.failedDisks = failedDisks.map(disk => ({
          device: disk.device,
          health: disk.health
        }));
        overallStatus = 'critical';
      }
      
      checks.push(diskCheck);
    }
    
    // Build the complete health check response
    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      system: {
        os: systemMetrics.os,
        loadAvg: systemMetrics.cpu.loadAvg
      }
    });
  } catch (error) {
    logger.error('Error in health check:', error);
    res.status(500).json({ error: 'Failed to perform health check' });
  }
});

/**
 * @route GET /api/admin/monitoring/errors
 * @desc Get recent error information
 * @access Admin
 */
router.get('/errors', (req, res) => {
  try {
    // In a real implementation, you would retrieve error logs from a store
    // For now, just return placeholder data
    const errorLogs = {
      count: 0,
      recent: [],
      message: 'Error logging not implemented yet'
    };
    
    res.json(errorLogs);
  } catch (error) {
    logger.error('Error fetching error logs:', error);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

/**
 * @route GET /api/admin/monitoring/dashboard
 * @desc Get all monitoring data for dashboard
 * @access Admin
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Collect all monitoring data for the dashboard in one call
    const [healthResponse, systemResponse, queueResponse] = await Promise.allSettled([
      // Call internal APIs (reusing logic but not making actual HTTP requests)
      new Promise((resolve) => {
        router.handle({ method: 'GET', url: '/health', path: '/health' }, 
          { json: resolve, status: () => ({ json: resolve }) });
      }),
      new Promise((resolve) => {
        router.handle({ method: 'GET', url: '/system', path: '/system' }, 
          { json: resolve, status: () => ({ json: resolve }) });
      }),
      new Promise((resolve, reject) => {
        if (!sensorQueue) {
          resolve({ error: 'Queue system unavailable' });
          return;
        }
        router.handle({ method: 'GET', url: '/queues', path: '/queues' }, 
          { json: resolve, status: () => ({ json: resolve }) });
      })
    ]);
    
    // Format dashboard data
    const dashboard = {
      timestamp: new Date().toISOString(),
      health: healthResponse.status === 'fulfilled' ? healthResponse.value : { error: 'Failed to fetch health data' },
      system: systemResponse.status === 'fulfilled' ? systemResponse.value : { error: 'Failed to fetch system data' },
      queues: queueResponse.status === 'fulfilled' ? queueResponse.value : { error: 'Failed to fetch queue data' },
    };
    
    res.json(dashboard);
  } catch (error) {
    logger.error('Error generating dashboard data:', error);
    res.status(500).json({ error: 'Failed to generate dashboard data' });
  }
});

/**
 * @route GET /api/admin/monitoring/network
 * @desc Get detailed network statistics
 * @access Admin
 */
router.get('/network', (req, res) => {
  try {
    const networkStats = metrics.getSystemMetrics().network;
    
    // Add more detailed data including response time distributions
    const enhancedNetworkStats = {
      ...networkStats,
      timestamp: new Date().toISOString(),
      timestampFormatted: new Date().toLocaleString(),
      
      // Add response time percentiles if there are enough samples
      responseTimes: {
        average: networkStats.avgResponseTime,
        statusCodes: networkStats.statusCodes,
        recentRequests: networkStats.recentRequests.map(req => ({
          ...req,
          timestamp: new Date(req.timestamp).toLocaleString(),
          path: req.path.substring(0, 50) // Truncate long paths
        }))
      }
    };
    
    res.json(enhancedNetworkStats);
  } catch (error) {
    logger.error('Error fetching network stats:', error);
    res.status(500).json({ error: 'Failed to fetch network statistics' });
  }
});

/**
 * @route GET /api/admin/monitoring/disk
 * @desc Get detailed disk health and usage information
 * @access Admin
 */
router.get('/disk', async (req, res) => {
  try {
    // Use the dedicated disk health utility
    const diskInfo = await diskHealth.getDiskHealth();
    
    res.json(diskInfo);
  } catch (error) {
    logger.error('Error fetching disk health info:', error);
    res.status(500).json({ 
      error: 'Failed to fetch disk health information',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/monitoring/memory
 * @desc Get detailed memory health and usage information
 * @access Admin
 */
router.get('/memory', async (req, res) => {
  try {
    // Get system metrics from our existing implementation
    const systemInfo = metrics.getSystemMetrics();
    
    // Return just the memory portion with enhanced details
    const memoryInfo = {
      ...systemInfo.memory,
      timestamp: new Date().toISOString(),
      details: {
        processMemory: process.memoryUsage(),
        swapUsage: {
          // Basic swap info - could be enhanced with OS-specific commands
          available: true,
          total: os.totalmem(),
          free: os.freemem()
        },
        // Add more detailed memory allocation information
        allocations: {
          heapTotal: process.memoryUsage().heapTotal,
          heapUsed: process.memoryUsage().heapUsed,
          external: process.memoryUsage().external,
          arrayBuffers: process.memoryUsage().arrayBuffers || 0,
          rss: process.memoryUsage().rss
        }
      }
    };
    
    res.json(memoryInfo);
  } catch (error) {
    logger.error('Error fetching memory health info:', error);
    res.status(500).json({ 
      error: 'Failed to fetch memory health information',
      message: error.message
    });
  }
});

// Helper functions

// Calculate CPU usage (simplified)
function calculateCpuUsage() {
  // This is a simplification - a real implementation would compare
  // CPU times between two points to get actual usage percentage
  const load = os.loadavg()[0];
  const cores = os.cpus().length;
  return (load / cores * 100).toFixed(2);
}

// Get network interfaces information
function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = {};
  
  for (const [name, netInterfaces] of Object.entries(interfaces)) {
    result[name] = netInterfaces.map(iface => ({
      address: iface.address,
      netmask: iface.netmask,
      family: iface.family,
      mac: iface.mac,
      internal: iface.internal,
    }));
  }
  
  return result;
}

module.exports = router; 