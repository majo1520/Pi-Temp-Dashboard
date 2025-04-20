# Performance Optimization in IoT Sensor Dashboard

This document outlines the performance optimizations that have been implemented in the IoT Sensor Dashboard project to ensure efficient operation, responsive user interface, and minimal resource usage across all system components.

## Table of Contents

1. [Frontend Optimizations](#frontend-optimizations)
2. [ApexCharts Performance Enhancement](#apexcharts-performance-enhancement)
3. [Backend API Optimizations](#backend-api-optimizations)
4. [Database Query Optimization](#database-query-optimization)
5. [MQTT Communication Efficiency](#mqtt-communication-efficiency)
6. [Advanced Logging System](#advanced-logging-system)
7. [Resource Utilization Monitoring](#resource-utilization-monitoring)
8. [Memory Management](#memory-management)

## Frontend Optimizations

### Lazy Loading Components

Components are loaded only when needed, reducing initial load time:

```javascript
// Lazy loading ApexCharts to improve initial load performance
const Chart = lazy(() => {
  logger.startPerformanceMeasure('chart_library_load');
  return import("react-apexcharts").then(module => {
    const loadDuration = logger.endPerformanceMeasure('chart_library_load', PERFORMANCE_CATEGORY);
    logger.log(`ApexCharts library loaded in ${loadDuration}ms`, {
      type: 'library_load',
      duration: loadDuration
    });
    return { default: module.default };
  });
});
```

### Code Splitting

The application is split into logical chunks that are loaded on demand:

- Dashboard components load only when viewing the dashboard
- Settings pages load only when navigating to settings
- Configuration tools load only when needed

### Efficient React Rendering

Several techniques have been implemented to ensure efficient React rendering:

1. **Memoization** of expensive calculations and components:
   ```javascript
   const chartOptions = useMemo(() => {
     // Complex options calculation
     return options;
   }, [dependencies]);
   ```

2. **Ref usage** to avoid unnecessary re-renders:
   ```javascript
   const chartInstanceRef = useRef(null);
   const chartOptionsRef = useRef(null);
   ```

3. **Optimized state updates** to batch changes:
   ```javascript
   useEffect(() => {
     // Batch multiple state updates
     setIsChartLoaded(true);
     // Other state updates
   }, []);
   ```

### View State Persistence

Chart zoom and scroll positions are maintained during data updates to improve user experience:

```javascript
// Effect to restore saved range when chart updates with new data
useEffect(() => {
  if (chartInstanceRef.current && isChartLoaded && savedRangeRef.current) {
    // Check if the user interaction timeout has elapsed
    const now = Date.now();
    const timeSinceLastInteraction = now - lastInteractionTimeRef.current;
    
    if (userInteractedRef.current && timeSinceLastInteraction < USER_INTERACTION_TIMEOUT) {
      try {
        const { minX, maxX } = savedRangeRef.current;
        // Restore view
        chartInstanceRef.current.updateOptions({
          xaxis: { min: minX, max: maxX }
        }, false, false);
      } catch (err) {
        logger.error('Error restoring chart range', err);
      }
    }
  }
}, [series, isChartLoaded]);
```

## ApexCharts Performance Enhancement

### Optimized Chart Options

Chart options are configured for optimal performance:

```javascript
chart: {
  animations: { enabled: false },        // Disable animations for better performance
  redrawOnParentResize: false,           // Prevent unnecessary redraws
  redrawOnWindowResize: false,           // Handle resize manually
}
```

### Data Point Sampling

For large datasets, data is sampled to maintain performance while preserving visual accuracy:

```javascript
// Calculate global min/max for appropriate Y axis scaling with sampling
if (series && series.length > 0) {
  series.forEach((s) => {
    if (s.data && s.data.length > 0) {
      const samplingStep = s.data.length > 1000 ? Math.floor(s.data.length / 100) : 1;
      for (let i = 0; i < s.data.length; i += samplingStep) {
        const point = s.data[i];
        if (point && point.y !== null && point.y !== -1 && !isNaN(point.y)) {
          globalMin = Math.min(globalMin, point.y);
          globalMax = Math.max(globalMax, point.y);
        }
      }
    }
  });
}
```

### Intelligent Data Loading

Different time ranges use appropriate data aggregation levels:

1. Recent data (last 24 hours): Full resolution
2. Medium-term data (last week): 5-minute aggregation
3. Long-term data (last month): 1-hour aggregation
4. Historical data (longer): 1-day aggregation

### Memory Usage Monitoring

Real-time monitoring of chart memory consumption with automatic optimizations:

```javascript
// Track memory usage periodically
useEffect(() => {
  const trackMemoryUsage = () => {
    if (window.performance && window.performance.memory) {
      const { usedJSHeapSize, jsHeapSizeLimit } = window.performance.memory;
      const usageRatio = usedJSHeapSize / jsHeapSizeLimit;
      
      logger.log(`Chart memory usage: ${Math.round(usageRatio * 100)}%`, {
        category: MEMORY_CATEGORY,
        usedHeap: usedJSHeapSize,
        heapLimit: jsHeapSizeLimit,
        usageRatio
      });
      
      // Log warning if memory usage is high
      if (usageRatio > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
        logger.warn(`High memory usage detected: ${Math.round(usageRatio * 100)}%`, {
          category: MEMORY_CATEGORY,
          usedHeap: usedJSHeapSize,
          heapLimit: jsHeapSizeLimit
        });
      }
    }
  };
  
  // Track memory every 30 seconds when chart is active
  const memoryTracker = setInterval(trackMemoryUsage, 30000);
  
  return () => clearInterval(memoryTracker);
}, [isChartLoaded]);
```

## Backend API Optimizations

### Response Compression

All API responses are compressed using gzip to reduce network transfer size:

```javascript
app.use(compression({
  threshold: 0,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
```

### Connection Pooling

Database connections are pooled to avoid the overhead of creating new connections:

```javascript
const influxPool = new InfluxConnectionPool({
  maxConnections: 10,
  minConnections: 2,
  acquireTimeout: 10000
});
```

### Efficient Data Transfer

JSON responses are optimized for size by removing unnecessary fields and using numeric IDs where possible:

```javascript
// Optimize response size by transforming data structure
function optimizeResponseSize(data) {
  return data.map(item => ({
    t: item.timestamp,               // Short key name for timestamp
    v: parseFloat(item.value),       // Convert to number and use short key
    l: item.location.substring(0, 1) // Use first letter of location 
  }));
}
```

### Rate Limiting

API requests are rate-limited to prevent abuse and ensure fair resource distribution:

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

app.use('/api/', limiter);
```

## Database Query Optimization

### Query Time Bucketing

Queries automatically adjust bucket sizes based on time range to maintain consistent point counts:

```javascript
function getBucketSize(from, to) {
  const rangeDuration = new Date(to) - new Date(from);
  
  if (rangeDuration < 24 * 60 * 60 * 1000) {        // Less than 1 day
    return '10s';
  } else if (rangeDuration < 7 * 24 * 60 * 60 * 1000) { // Less than 1 week
    return '5m';
  } else if (rangeDuration < 30 * 24 * 60 * 60 * 1000) { // Less than 1 month
    return '1h';
  } else {
    return '1d';
  }
}
```

### Parallel Queries

Multiple measurements are queried in parallel for faster dashboard loading:

```javascript
// Execute multiple queries in parallel
const [temperatureData, humidityData, pressureData] = await Promise.all([
  influxService.queryData('temperature', from, to, locations),
  influxService.queryData('humidity', from, to, locations),
  influxService.queryData('pressure', from, to, locations)
]);
```

### Custom Retention Policies

Data retention policies automatically optimize storage based on data age:

- High-precision data (< 24 hours): stored in 10-second intervals
- Medium-term data (< 7 days): downsampled to 5-minute averages
- Long-term data (< 30 days): downsampled to 1-hour averages
- Historical data (> 30 days): downsampled to daily averages

## MQTT Communication Efficiency

### Message Size Optimization

Sensor data messages are optimized for minimal payload size:

```json
{
  "t": 1625097600000,
  "v": 23.5,
  "l": "office"
}
```

Instead of the more verbose:

```json
{
  "timestamp": 1625097600000,
  "value": 23.5,
  "location": "office",
  "unit": "celsius"
}
```

### QoS Level Selection

Different MQTT Quality of Service (QoS) levels are used based on data importance:

- Critical measurements: QoS 2 (Exactly once delivery)
- Regular measurements: QoS 1 (At least once delivery)
- High-frequency data: QoS 0 (At most once delivery)

### Topic Organization

MQTT topics are organized hierarchically for efficient message filtering:

```
senzory/{location}/{measurement}
```

This allows subscribers to filter messages at the broker level, reducing unnecessary message processing.

## Advanced Logging System

### Performance Metrics Tracking

Key operations are timed and logged for performance analysis:

```javascript
logger.startPerformanceMeasure('chart_update');
// Chart update code
const updateDuration = logger.endPerformanceMeasure('chart_update', PERFORMANCE_CATEGORY);
logger.log(`Chart update completed in ${updateDuration}ms`, {
  type: UPDATE_METRIC,
  chartType,
  seriesCount: series?.length,
  dataPoints: series?.[0]?.data?.length
});
```

### Log Rotation and Aggregation

Logs are automatically rotated and aggregated to prevent excessive storage consumption:

```javascript
logger.configureRotation({
  category: PERFORMANCE_CATEGORY,
  maxEntries: 1000,
  rotationInterval: 24 * 60 * 60 * 1000, // 24 hours
  aggregationInterval: 5 * 60 * 1000     // 5 minutes
});
```

### Performance Thresholds

Automated warnings are generated when performance falls below defined thresholds:

```javascript
const PERFORMANCE_THRESHOLDS = {
  RENDER_WARNING: 500, // ms
  UPDATE_WARNING: 300, // ms
  OPTIONS_WARNING: 200, // ms
  MEMORY_WARNING: 0.8 // 80% of heap limit
};

if (optionsDuration > PERFORMANCE_THRESHOLDS.OPTIONS_WARNING) {
  logger.warn(`Slow chart options generation: ${optionsDuration}ms`, {
    type: OPTIONS_METRIC,
    chartType,
    threshold: PERFORMANCE_THRESHOLDS.OPTIONS_WARNING
  });
}
```

## Resource Utilization Monitoring

### Real-time Resource Tracking

The system continuously monitors CPU, memory, and network usage:

```javascript
// Memory usage monitoring
if (window.performance && window.performance.memory) {
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = window.performance.memory;
  logger.log('Memory usage', { 
    usedJSHeapSize, 
    totalJSHeapSize, 
    jsHeapSizeLimit,
    usagePercentage: (usedJSHeapSize / jsHeapSizeLimit) * 100
  });
}
```

### Automatic Recovery

The system can automatically recover from performance issues:

```javascript
// Attempt to recover from error if possible
try {
  if (chartInstanceRef.current) {
    logger.log("Attempting to recover from chart error", {
      category: ERROR_CATEGORY,
      recovery: 'reset_chart'
    });
    chartInstanceRef.current.updateOptions({
      chart: {
        animations: {
          enabled: false
        }
      }
    }, false, true);
  }
} catch (recoveryError) {
  logger.error("Failed to recover from chart error", {
    error: recoveryError.message,
    category: ERROR_CATEGORY
  });
}
```

## Memory Management

### Garbage Collection Hints

Strategic points in the code provide hints to the JavaScript engine for garbage collection:

```javascript
// Clear memory references
useEffect(() => {
  return () => {
    if (chartInstanceRef.current) {
      try {
        // Clear references to help garbage collection
        chartInstanceRef.current = null;
        chartOptionsRef.current = null;
        chartColorRef.current = null;
        
        // Force a garbage collection hint (not guaranteed)
        if (window.gc) window.gc();
      } catch (err) {
        logger.error("Error cleaning up chart:", err);
      }
    }
  };
}, []);
```

### Data Disposal

Large datasets are disposed of when no longer needed:

```javascript
useEffect(() => {
  return () => {
    // Dispose large dataset
    if (largeDatasetRef.current) {
      largeDatasetRef.current = null;
    }
  };
}, []);
```

### Reuse DOM Elements

Where possible, DOM elements are reused rather than recreated:

```javascript
// Reuse the chart container instead of recreating it
useEffect(() => {
  if (fullScreen) {
    const style = document.createElement('style');
    // ... style content
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }
}, [fullScreen]);
```

---

These optimization techniques work together to create a responsive, efficient, and resource-friendly IoT Sensor Dashboard capable of handling large datasets and multiple concurrent users while maintaining excellent performance. 