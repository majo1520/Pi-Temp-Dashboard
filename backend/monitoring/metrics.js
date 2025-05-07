/**
 * Prometheus Metrics Module - Simplified Mock Version
 * 
 * This module provides a mock implementation of the metrics functionality
 * when the prom-client package is not available.
 */

const os = require('os');
const logger = require('../utils/logger');
const diskHealth = require('../utils/diskHealth');

// Mock register object
const register = {
  contentType: 'text/plain',
  metrics: async () => 'Prometheus metrics collection is disabled'
};

// Mock middleware that does nothing
function metricsMiddleware(req, res, next) {
  next();
}

// Mock function for updating queue metrics
async function updateQueueMetrics(sensorQueue) {
  try {
    // Just log that we attempted to update metrics
    logger.info('Metrics collection disabled: updateQueueMetrics called');
    return null;
  } catch (error) {
    logger.error('Error in updateQueueMetrics:', error);
  }
}

// Mock functions for various metrics recording
function recordJobProcessed(queue, status, duration) {
  // No-op implementation
}

function recordCacheOperation(hit, type = 'redis') {
  // No-op implementation
}

function recordCacheOperationDuration(operation, duration, type = 'redis') {
  // No-op implementation
}

function recordInfluxQueryDuration(queryType, duration) {
  // No-op implementation
}

function recordError(errorType, location) {
  // No-op implementation
}

// Track network statistics (simplified since Node.js doesn't provide direct network traffic stats)
let networkStats = {
  requestsTotal: 0,
  bytesReceived: 0,
  bytesSent: 0,
  requestTimes: [],
  lastUpdated: Date.now()
};

// Track the last 100 response times for performance metrics
const MAX_RESPONSE_TIMES = 100;

// Record request/response metrics
function recordHttpRequest(method, path, statusCode, requestSize, responseSize, timeMs) {
  // Update overall stats
  networkStats.requestsTotal++;
  networkStats.bytesReceived += requestSize || 0;
  networkStats.bytesSent += responseSize || 0;
  
  // Track response time
  networkStats.requestTimes.push({
    timestamp: Date.now(),
    method,
    path,
    statusCode,
    timeMs
  });
  
  // Keep only the most recent entries
  if (networkStats.requestTimes.length > MAX_RESPONSE_TIMES) {
    networkStats.requestTimes.shift();
  }
  
  // Update timestamp
  networkStats.lastUpdated = Date.now();
}

// Express middleware to track request/response metrics
function responseTimeMiddleware(req, res, next) {
  const start = Date.now();
  const requestSize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
  
  // Add listener for response finish
  res.on('finish', () => {
    const responseSize = res.getHeader('content-length') ? parseInt(res.getHeader('content-length'), 10) : 0;
    const timeMs = Date.now() - start;
    
    // Record metrics
    recordHttpRequest(
      req.method,
      req.path,
      res.statusCode,
      requestSize,
      responseSize,
      timeMs
    );
  });
  
  next();
}

// Get network statistics
function getNetworkStats() {
  // Calculate average response time from the last 100 requests
  const avgResponseTime = networkStats.requestTimes.length > 0
    ? networkStats.requestTimes.reduce((sum, req) => sum + req.timeMs, 0) / networkStats.requestTimes.length
    : 0;
  
  // Get distribution of response times by status code
  const statusCodes = {};
  networkStats.requestTimes.forEach(req => {
    const statusGroup = Math.floor(req.statusCode / 100) + 'xx';
    if (!statusCodes[statusGroup]) {
      statusCodes[statusGroup] = { count: 0, avgTime: 0, totalTime: 0 };
    }
    statusCodes[statusGroup].count++;
    statusCodes[statusGroup].totalTime += req.timeMs;
  });
  
  // Calculate average time per status group
  Object.keys(statusCodes).forEach(group => {
    statusCodes[group].avgTime = statusCodes[group].totalTime / statusCodes[group].count;
  });
  
  return {
    requestsTotal: networkStats.requestsTotal,
    bytesReceived: networkStats.bytesReceived,
    bytesReceivedFormatted: formatBytes(networkStats.bytesReceived),
    bytesSent: networkStats.bytesSent,
    bytesSentFormatted: formatBytes(networkStats.bytesSent),
    avgResponseTime: avgResponseTime.toFixed(2),
    recentRequests: networkStats.requestTimes.slice(-10), // Last 10 requests
    statusCodeDistribution: statusCodes,
    lastUpdated: new Date(networkStats.lastUpdated).toISOString()
  };
}

// Helper function to get basic system metrics
function getSystemMetrics() {
  // Get detailed CPU information per core
  const cpuInfo = os.cpus();
  const cpuCores = cpuInfo.map((cpu, index) => {
    const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
    const idle = cpu.times.idle;
    const usage = 100 - (idle / total * 100);
    
    return {
      model: cpu.model,
      speed: `${cpu.speed} MHz`,
      times: cpu.times,
      usage: usage.toFixed(2)
    };
  });

  // Calculate average CPU usage across all cores
  const avgCpuUsage = cpuCores.reduce((sum, core) => sum + parseFloat(core.usage), 0) / cpuCores.length;
  
  // Get more detailed memory information
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);
  
  // Get system load averages for 1, 5, and 15 minutes
  const loadAvg = os.loadavg();
  
  // Try to get disk information from our new utility
  // But fallback to basic info if it fails
  let diskInfo = {
    available: true,
    note: "Detailed disk information will be fetched on demand"
  };
  
  // Since getDiskHealth is async and this function is sync,
  // we'll just provide basic disk info here and let the
  // dedicated endpoint handle the detailed async fetching
  try {
    // Get a synchronous basic overview 
    const osPlatform = os.platform();
    
    if (osPlatform === 'win32') {
      diskInfo = {
        available: true,
        platform: 'windows',
        note: "Use dedicated /disk endpoint for detailed Windows disk information"
      };
    } else {
      // For Unix systems, try reading df -h output directly,
      // but don't fail if it doesn't work
      try {
        const { execSync } = require('child_process');
        const dfOutput = execSync('df -h').toString();
        
        diskInfo = {
          available: true,
          platform: osPlatform,
          summary: "Basic disk information available. Use /disk endpoint for details.",
          dfOutput: dfOutput.split('\n')
        };
      } catch (dfError) {
        diskInfo = {
          available: false,
          platform: osPlatform,
          error: "Could not get basic disk information",
          note: "Use dedicated /disk endpoint for detailed information"
        };
      }
    }
  } catch (diskError) {
    logger.warn('Error getting basic disk info:', diskError.message);
  }
  
  // Network interfaces with more information
  const networkInterfaces = {};
  const netInterfaces = os.networkInterfaces();
  
  Object.keys(netInterfaces).forEach(ifName => {
    networkInterfaces[ifName] = netInterfaces[ifName].map(iface => ({
      address: iface.address,
      netmask: iface.netmask,
      family: iface.family,
      mac: iface.mac,
      internal: iface.internal,
      cidr: iface.cidr
    }));
  });
  
  // Process information
  const processInfo = {
    pid: process.pid,
    ppid: process.ppid,
    title: process.title,
    arch: process.arch,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    versions: process.versions,
    // Resource usage if available (Node.js 12.6.0+)
    resourceUsage: process.resourceUsage ? process.resourceUsage() : null
  };
  
  // Get network traffic statistics
  const networkTraffic = getNetworkStats();
  
  return {
    timestamp: new Date().toISOString(),
    cpu: {
      cores: cpuInfo.length,
      model: cpuInfo[0]?.model || 'Unknown',
      loadAvg: loadAvg,
      loadAvg1min: loadAvg[0],
      loadAvg5min: loadAvg[1],
      loadAvg15min: loadAvg[2],
      utilizationPercent: avgCpuUsage.toFixed(2),
      coreDetails: cpuCores
    },
    memory: {
      total: totalMem,
      totalFormatted: formatBytes(totalMem),
      free: freeMem,
      freeFormatted: formatBytes(freeMem),
      used: usedMem,
      usedFormatted: formatBytes(usedMem),
      utilizationPercent: memUsagePercent
    },
    uptime: {
      system: os.uptime(),
      systemFormatted: formatUptime(os.uptime()),
      process: process.uptime(),
      processFormatted: formatUptime(process.uptime())
    },
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      hostname: os.hostname(),
      homedir: os.homedir(),
      endianness: os.endianness(),
      tmpdir: os.tmpdir()
    },
    network: {
      interfaces: networkInterfaces,
      stats: networkTraffic,
      requestCount: networkTraffic.requestsTotal,
      avgResponseTime: networkTraffic.avgResponseTime + 'ms',
      statusCodes: networkTraffic.statusCodeDistribution,
      recentRequests: networkTraffic.recentRequests
    },
    disk: diskInfo,
    process: processInfo
  };
}

// Helper function to format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (!bytes) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Helper function to format uptime in a human-readable format
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor(seconds % (3600 * 24) / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

module.exports = {
  register,
  metricsMiddleware,
  updateQueueMetrics,
  recordJobProcessed,
  recordCacheOperation,
  recordCacheOperationDuration,
  recordInfluxQueryDuration,
  recordError,
  getSystemMetrics,
  formatBytes,
  formatUptime,
  responseTimeMiddleware,
  recordHttpRequest
}; 