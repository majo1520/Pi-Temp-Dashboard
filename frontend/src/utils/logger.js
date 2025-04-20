/**
 * Enhanced logging utility with aggregation, rotation, and performance metrics
 */
import { isLogsEnabled } from './toggleLogs';

// Constants for log management
const MAX_LOG_SIZE = 1000;
const ROTATION_INTERVAL = 1000 * 60 * 60; // 1 hour
const AGGREGATION_INTERVAL = 1000 * 60; // 1 minute
const PERFORMANCE_SAMPLE_SIZE = 100;

class EnhancedLogger {
  constructor() {
    this.logs = [];
    this.aggregatedMetrics = new Map();
    this.performanceMetrics = new Map();
    this.enabled = isLogsEnabled();
    
    // Initialize rotation
    this.setupRotation();
    
    // Initialize aggregation
    this.setupAggregation();
    
    // Initialize performance tracking
    this.performanceMarks = new Map();
  }

  // Log rotation
  setupRotation() {
    setInterval(() => {
      if (this.logs.length > MAX_LOG_SIZE) {
        const timestamp = new Date().toISOString();
        const archiveKey = `logs_archive_${timestamp}`;
        try {
          localStorage.setItem(archiveKey, JSON.stringify(this.logs));
          this.logs = [];
          this.log('Log rotation completed', { archiveKey });
        } catch (error) {
          this.error('Log rotation failed', error);
        }
      }
    }, ROTATION_INTERVAL);
  }

  // Metrics aggregation
  setupAggregation() {
    setInterval(() => {
      this.aggregatedMetrics.forEach((metrics, category) => {
        if (metrics.values.length > 0) {
          const avg = metrics.values.reduce((a, b) => a + b, 0) / metrics.values.length;
          const min = Math.min(...metrics.values);
          const max = Math.max(...metrics.values);
          
          this.logs.push({
            type: 'metric_aggregation',
            category,
            timestamp: new Date().toISOString(),
            metrics: { avg, min, max, count: metrics.values.length }
          });
          
          metrics.values = [];
        }
      });
    }, AGGREGATION_INTERVAL);
  }

  // Performance measurement
  startPerformanceMeasure(label) {
    if (!this.enabled) return;
    this.performanceMarks.set(label, performance.now());
  }

  endPerformanceMeasure(label, category = 'default') {
    if (!this.enabled || !this.performanceMarks.has(label)) return;
    
    const startTime = this.performanceMarks.get(label);
    const duration = performance.now() - startTime;
    this.performanceMarks.delete(label);

    // Store performance metric
    if (!this.aggregatedMetrics.has(category)) {
      this.aggregatedMetrics.set(category, { values: [] });
    }
    
    const metrics = this.aggregatedMetrics.get(category);
    metrics.values.push(duration);
    
    // Trim if too many samples
    if (metrics.values.length > PERFORMANCE_SAMPLE_SIZE) {
      metrics.values = metrics.values.slice(-PERFORMANCE_SAMPLE_SIZE);
    }

    return duration;
  }

  // Basic logging methods with enhanced context
  log(...args) {
    if (!this.enabled) return;
    
    const logEntry = this.createLogEntry('log', args);
    this.logs.push(logEntry);
    console.log(...args);
  }

  info(...args) {
    if (!this.enabled) return;
    
    const logEntry = this.createLogEntry('info', args);
    this.logs.push(logEntry);
    console.info(...args);
  }

  warn(...args) {
    if (!this.enabled) return;
    
    const logEntry = this.createLogEntry('warn', args);
    this.logs.push(logEntry);
    console.warn(...args);
  }

  error(...args) {
    // Always log errors
    const logEntry = this.createLogEntry('error', args);
    this.logs.push(logEntry);
    console.error(...args);
  }

  debug(...args) {
    if (!this.enabled || process.env.NODE_ENV === 'production') return;
    
    const logEntry = this.createLogEntry('debug', args);
    this.logs.push(logEntry);
    console.debug(...args);
  }

  // Create structured log entry
  createLogEntry(level, args) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message: args[0],
      details: args.slice(1),
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize
      } : undefined,
      url: window.location.href
    };
  }

  // Get aggregated metrics
  getMetrics(category = 'default') {
    const metrics = this.aggregatedMetrics.get(category);
    if (!metrics || metrics.values.length === 0) return null;
    
    return {
      avg: metrics.values.reduce((a, b) => a + b, 0) / metrics.values.length,
      min: Math.min(...metrics.values),
      max: Math.max(...metrics.values),
      count: metrics.values.length
    };
  }

  // Export logs
  exportLogs() {
    return {
      logs: this.logs,
      metrics: Object.fromEntries(this.aggregatedMetrics),
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const logger = new EnhancedLogger();

// Export singleton
export default logger; 