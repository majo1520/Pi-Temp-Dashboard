import { useState, useEffect, useCallback, useMemo } from 'react';
import mqtt from 'mqtt';
import config from '../config';
import { 
  parseIntervalToMs, 
  parseFluxToMs, 
  fillDataGaps,
  prepareDailyHeatmapData,
  prepareHeatmapData,
  splitDataByYear
} from '../utils/chartUtils.jsx';
import { RANGES, HEATMAP_AGGREGATORS } from '../constants';
import * as api from '../services/api';

const { FIELDS } = config;

// Add performance optimization constants
const BATCH_SIZE = 1000; // Number of points to process at once
const MAX_POINTS = 5000; // Maximum points to display for performance

/**
 * Custom hook for managing sensor data
 * @param {Object} options - Configuration options
 * @param {Object} errorHandler - Error handler from useErrorHandler hook
 * @returns {Object} Sensor data and related functions
 */
function useSensorData({ 
  selectedLocations = [], 
  rangeKey = "6h",
  autoRefresh = true,
  customStart = "",
  customEnd = "",
  customApplied = false,
  heatmapField = 'teplota'
}, errorHandler) {
  // Sensor data states
  const [allSensors, setAllSensors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  
  // Real-time data
  const [mqttData, setMqttData] = useState({});
  const [lastSeen, setLastSeen] = useState({});
  const [chartData, setChartData] = useState({});
  
  // Historical data
  const [historicalChartData, setHistoricalChartData] = useState({});
  
  const { handleError } = errorHandler || {};

  // Filter for visible location sensors
  const visibleLocationSensors = useMemo(() => 
    allSensors.filter(s => s.locationVisible !== false)
  , [allSensors]);

  // Filter for visible card sensors (for sensor cards in dashboard)
  const visibleCardSensors = useMemo(() => 
    allSensors.filter(s => s.cardVisible !== false)
  , [allSensors]);

  // Map of field names in case the API returns different field names
  const fieldMapping = {
    'teplota': ['teplota', 'temperature', 'temp', 'teploty', 'temp_c', 'temperature_c'],
    'vlhkost': ['vlhkost', 'humidity', 'hum', 'vlhkosť', 'humidity_pct', 'hum_pct', 'vlhkost_vzduchu', 'relative_humidity'],
    'tlak': ['tlak', 'pressure', 'pres', 'pressure_hpa', 'air_pressure', 'barometer', 'atmospheric_pressure', 'tlak_vzduchu']
  };

  // Add name variations with different capitalizations
  Object.keys(fieldMapping).forEach(field => {
    const variations = [...fieldMapping[field]];
    variations.forEach(variation => {
      // Add uppercase version
      fieldMapping[field].push(variation.toUpperCase());
      // Add capitalized version
      fieldMapping[field].push(variation.charAt(0).toUpperCase() + variation.slice(1));
      // Add lowercase version
      fieldMapping[field].push(variation.toLowerCase());
    });
  });

  // Helper function to get the correct field name from API data
  const getMatchingField = (apiField, targetField) => {
    if (!apiField) return false;
    const apiFieldLower = apiField.toLowerCase();
    
    // Exact match with the target field
    if (apiFieldLower === targetField.toLowerCase()) {
      return true;
    }
    
    // Check against the field mapping for exact matches
    if (fieldMapping[targetField]) {
      return fieldMapping[targetField].some(variant => 
        apiFieldLower === variant.toLowerCase() || 
        // For partial matches, ensure it's a word boundary to avoid cross-field matches
        (apiFieldLower.includes(variant.toLowerCase()) && 
         (apiFieldLower.length === variant.length || 
          apiFieldLower.indexOf(variant.toLowerCase()) === 0 || 
          apiFieldLower.indexOf(variant.toLowerCase()) + variant.length === apiFieldLower.length ||
          /\W/.test(apiFieldLower.charAt(apiFieldLower.indexOf(variant.toLowerCase()) - 1)) || 
          /\W/.test(apiFieldLower.charAt(apiFieldLower.indexOf(variant.toLowerCase()) + variant.length))
         )
        )
      );
    }
    
    return false;
  };

  // Function to extract time-series data for a specific field from various response formats
  const extractTimeSeriesData = (data, field, startTime, endTime) => {
    // If no data, return empty array
    if (!data) return [];
    
    let extractedData = [];
    
    try {
      // Special handling for InfluxDB responses with case sensitivity issues
      if (Array.isArray(data) && data.length > 0 && data[0]._field) {
        // First try with exact field match
        let fieldData = data.filter(item => getMatchingField(item._field, field));
        
        // If no data found, try case-insensitive matching
        if (fieldData.length === 0) {
          const fieldLower = field.toLowerCase();
          fieldData = data.filter(item => {
            const itemFieldLower = (item._field || '').toLowerCase();
            return itemFieldLower === fieldLower || 
                   fieldMapping[field]?.some(variant => 
                     itemFieldLower === variant.toLowerCase()
                   );
          });
        }
        
        if (fieldData.length > 0) {
          return fieldData.map(item => ({
            time: new Date(item._time).getTime(),
            value: parseFloat(item._value)
          }));
        }
      }
      
      // Case 2: Object with field names as keys, each containing an array of data points
      if (!Array.isArray(data) && typeof data === 'object') {
        // Check if any key in the object matches our field
        for (const key of Object.keys(data)) {
          if (getMatchingField(key, field) && Array.isArray(data[key])) {
            return data[key].map(point => {
              // Handle different time-value pair formats
              if (typeof point === 'object' && point.time && (point.value !== undefined)) {
                return { 
                  time: typeof point.time === 'number' ? point.time : new Date(point.time).getTime(), 
                  value: parseFloat(point.value) 
                };
              } else if (Array.isArray(point) && point.length === 2) {
                // [time, value] format
                return { 
                  time: typeof point[0] === 'number' ? point[0] : new Date(point[0]).getTime(), 
                  value: parseFloat(point[1]) 
                };
              }
              return null;
            }).filter(Boolean); // Remove any null entries
          }
        }
      }
      
      // Case 3: Array of objects where each object has a property matching the field
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        // Find matching field name in the first object
        const fieldVariants = [field, ...fieldMapping[field]];
        let matchedField = null;
        
        for (const variant of fieldVariants) {
          if (data[0][variant] !== undefined) {
            matchedField = variant;
            break;
          }
        }
        
        if (matchedField) {
          return data.map(point => {
            let time = point.time || point.timestamp || point.date;
            if (!time) {
              // If no time field, create evenly spaced points
              const index = data.indexOf(point);
              time = new Date(startTime + index * (endTime - startTime) / data.length).getTime();
            } else if (typeof time !== 'number') {
              time = new Date(time).getTime();
            }
            
            return {
              time,
              value: parseFloat(point[matchedField])
            };
          });
        }
      }
      
      // Case 4: Plain array of values (assume evenly spaced over time range)
      if (Array.isArray(data) && data.length > 0 && typeof data[0] !== 'object') {
        return data.map((value, index) => ({
          time: new Date(startTime + index * (endTime - startTime) / data.length).getTime(),
          value: parseFloat(value)
        }));
      }
    } catch (error) {
      console.error(`Error extracting time series data for ${field}:`, error);
    }
    
    return extractedData;
  };

  /**
   * Fetch all sensors from API
   */
  const fetchSensors = useCallback(async () => {
    try {
      const data = await api.getSensors();
      setAllSensors(data);
      return data;
    } catch (error) {
      if (handleError) {
        handleError(error, 'fetch-sensors');
      } else {
        console.error('Error fetching sensors:', error);
      }
      return [];
    }
  }, [handleError]);

  /**
   * Fetch locations from API
   */
  const fetchLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const values = await api.getSensorLocations();
      setLocations(values);
      return values;
    } catch (error) {
      if (handleError) {
        handleError(error, 'fetch-locations');
      } else {
        console.error('Error fetching locations:', error);
      }
      return [];
    } finally {
      setLoadingLocations(false);
    }
  }, [handleError]);

  /**
   * Setup MQTT connection for live data
   */
  useEffect(() => {
    if (rangeKey !== 'live') return;
    
    // Use MQTT settings from config
    const client = mqtt.connect(config.MQTT_URL);
    
    client.on('connect', () => client.subscribe(config.MQTT_TOPIC));
    client.on('message', (_, message) => {
      if (!autoRefresh) return;
      
      try {
        const data = JSON.parse(message.toString());
        if (data.location) {
          setMqttData(prev => ({ ...prev, [data.location]: data }));
          setLastSeen(prev => ({ ...prev, [data.location]: Date.now() }));
          setChartData(prev => {
            const now = new Date();
            const updated = { ...prev };
            updated[data.location] = updated[data.location] || {};
            
            FIELDS.forEach(field => {
              // Try multiple possible field names
              let fieldNames = fieldMapping[field] || [];
              let value = null;
              
              // Look for value in any of the possible field names
              for (const fieldName of fieldNames) {
                if (data[fieldName] !== undefined) {
                  value = parseFloat(data[fieldName]);
                  if (!isNaN(value)) break;
                }
              }
              
              // If still not found, try the original field name
              if (value === null) {
                value = parseFloat(data[field]);
              }
              
              if (!isNaN(value)) {
                const entry = { time: now.getTime(), value };
                const fieldData = (updated[data.location][field] || []).filter(
                  d => now.getTime() - d.time < 5 * 60 * 1000
                );
                updated[data.location][field] = [...fieldData, entry];
              }
            });
            
            return updated;
          });
        }
      } catch (e) {
        console.error('Error parsing MQTT message:', e);
      }
    });
    
    return () => client.end();
  }, [rangeKey, autoRefresh]);

  /**
   * Batch process data points to improve performance
   * @param {Array} data Raw data points
   * @param {number} startTime Start timestamp
   * @param {number} endTime End timestamp
   * @returns {Array} Processed data points
   */
  const batchProcessData = (data, startTime, endTime) => {
    if (!data || data.length === 0) return [];
    
    // Calculate target number of points based on time range
    const timeRange = endTime - startTime;
    const targetPoints = Math.min(MAX_POINTS, data.length);
    const skipFactor = Math.max(1, Math.floor(data.length / targetPoints));
    
    const processedData = [];
    for (let i = 0; i < data.length; i += skipFactor) {
      const point = data[i];
      if (point.time >= startTime && point.time <= endTime) {
        processedData.push(point);
      }
    }
    
    return processedData;
  };

  // Optimize data processing for longer ranges
  const processTimeSeriesData = useCallback((data, startTime, endTime, gapInterval) => {
    if (!data || data.length === 0) return [];

    // Sort data chronologically
    const sortedData = data
      .filter(point => point.time && !isNaN(point.time) && !isNaN(point.value))
      .sort((a, b) => a.time - b.time);

    // Calculate total days in this range
    const days = (endTime - startTime) / (1000 * 60 * 60 * 24);
    console.log(`Processing data range spanning ${days.toFixed(1)} days with ${sortedData.length} points`);

    // For longer ranges, use adaptive sampling based on total days
    let samplingInterval = gapInterval;
    if (rangeKey === '30d') {
      samplingInterval = 3600000; // 1 hour for 30d
    } else if (rangeKey === '180d') {
      samplingInterval = 10800000; // 3 hours for 180d
    } else if (rangeKey === '365d') {
      // For 365d, use an adaptive approach based on data density
      if (sortedData.length > 5000) {
        samplingInterval = 43200000; // 12 hours for dense datasets
      } else if (sortedData.length > 2000) {
        samplingInterval = 21600000; // 6 hours for medium datasets
      } else {
        samplingInterval = 10800000; // 3 hours for sparse datasets
      }
      console.log(`Using adaptive 365d sampling interval: ${samplingInterval / 3600000} hours based on ${sortedData.length} points`);
    }

    // Process data with adaptive sampling
    const processedData = [];
    let currentBucket = Math.floor(startTime / samplingInterval) * samplingInterval;
    let bucketPoints = [];

    sortedData.forEach(point => {
      const pointBucket = Math.floor(point.time / samplingInterval) * samplingInterval;
      
      if (pointBucket !== currentBucket && bucketPoints.length > 0) {
        // Calculate average for the bucket
        const avgValue = bucketPoints.reduce((sum, p) => sum + p.value, 0) / bucketPoints.length;
        processedData.push({
          time: currentBucket,
          value: Number(avgValue.toFixed(2))
        });
        bucketPoints = [];
        currentBucket = pointBucket;
      }
      
      bucketPoints.push(point);
    });

    // Handle last bucket
    if (bucketPoints.length > 0) {
      const avgValue = bucketPoints.reduce((sum, p) => sum + p.value, 0) / bucketPoints.length;
      processedData.push({
        time: currentBucket,
        value: Number(avgValue.toFixed(2))
      });
    }

    // For 365d, ensure we have sufficient status change points to accurately represent online/offline transitions
    if (rangeKey === '365d') {
      // Find points where status changes (values make significant jumps)
      const statusChangePoints = [];
      for (let i = 1; i < sortedData.length; i++) {
        const prev = sortedData[i-1];
        const curr = sortedData[i];
        
        // Consider significant changes that aren't already close to a bucket boundary
        const valueDelta = Math.abs(curr.value - prev.value);
        const timeDelta = curr.time - prev.time;
        
        // Add status change point if:
        // 1. Large value change in a short time, or
        // 2. There's a large gap in the data (potential offline period)
        if ((valueDelta > 10 && timeDelta < samplingInterval) || timeDelta > samplingInterval * 2) {
          const nearestBucket = processedData.find(p => Math.abs(p.time - curr.time) < samplingInterval/2);
          if (!nearestBucket) {
            statusChangePoints.push({
              time: curr.time,
              value: curr.value
            });
          }
        }
      }
      
      // Add these status change points to the processed data
      if (statusChangePoints.length > 0) {
        processedData.push(...statusChangePoints);
        // Re-sort the data by time
        processedData.sort((a, b) => a.time - b.time);
        console.log(`Added ${statusChangePoints.length} status change points to 365d data`);
      }
    }

    // Fill gaps in processed data
    return fillDataGaps(processedData, startTime, endTime, samplingInterval);
  }, [rangeKey]);

  // Fetch historical data for given locations and fields
  const fetchHistoricalData = async (locations, range, fields) => {
    try {
      console.log('Fetching historical data:', { locations, range, fields });
      
      // Determine appropriate data handling strategy
      const determineDataStrategy = (range, customStart, customEnd) => {
        if (range === 'custom' && customStart && customEnd) {
          const start = new Date(customStart).getTime();
          const end = new Date(customEnd).getTime();
          const durationHours = (end - start) / (1000 * 60 * 60);
          
          if (durationHours > 720) { // > 30 days
            return { isLargeRange: true, aggregationWindow: '6h' };
          } else if (durationHours > 168) { // > 7 days
            return { isLargeRange: true, aggregationWindow: '1h' };
          } else if (durationHours > 24) { // > 1 day
            return { isLargeRange: true, aggregationWindow: '30m' };
          }
        } else if (['30d', '365d', '7d'].includes(range)) {
          return { isLargeRange: true, aggregationWindow: range === '365d' ? '6h' : (range === '30d' ? '1h' : '30m') };
        }
        
        return { isLargeRange: false, aggregationWindow: null };
      };
      
      const strategy = determineDataStrategy(range, customStart, customEnd);
      console.log('Using data strategy:', strategy);
      
      const promises = locations.map(async (location) => {
        // Start timer for performance tracking
        const startTime = performance.now();
        
        const response = await api.getHistoricalData({
          locations: [location],
          fields: Array.isArray(fields) ? fields : fields.split(','),
          timeRange: {
            rangeKey: range,
            start: range === 'custom' ? customStart : undefined,
            end: range === 'custom' ? customEnd : undefined
          }
        });
        
        // Log performance metrics
        const endTime = performance.now();
        const fetchDuration = endTime - startTime;
        console.log(`Historical data for ${location} fetched in ${fetchDuration.toFixed(0)}ms with ${response.length} records`);
        
        // Handle both array and object response formats
        const processedData = Array.isArray(response) ? response : response.data || [];
        
        return {
          location,
          data: processedData.map(item => ({
            timestamp: item.timestamp || item._time,
            value: parseFloat(item.value || item._value),
            field: item.field || item._field
          }))
        };
      });

      const results = await Promise.all(promises);
      console.log('Processed historical data results:', 
        results.map(r => `${r.location}: ${r.data.length} records`));
      
      // Convert array of location results to object keyed by location
      return results.reduce((acc, { location, data }) => {
        acc[location] = data;
        return acc;
      }, {});
    } catch (error) {
      console.error('Error in fetchHistoricalData:', error);
      if (handleError) {
        handleError(error, 'fetch-historical-data');
      } else {
        console.error('Error fetching historical data:', error);
      }
      return {};
    }
  };

  // Update historical data fetching
  useEffect(() => {
    if (rangeKey === 'live' || selectedLocations.length === 0) return;

    let isMounted = true;
    const controller = new AbortController();
    const { signal } = controller;

    const range = RANGES[rangeKey];
    if (!range) return;

    const intervalMs = parseIntervalToMs(range.interval);
    const fluxMs = parseFluxToMs(range.flux);
    
    let startTime, endTime;
    if (rangeKey === 'custom' && customApplied) {
      startTime = new Date(customStart).getTime();
      endTime = new Date(customEnd).getTime();
    } else if (rangeKey === 'custom' && !customApplied) {
      // Don't fetch if custom range is selected but not applied
      console.log('Custom range selected but not applied yet. Please select dates and click Apply.');
      return;
    } else {
      endTime = Date.now();
      startTime = endTime + fluxMs;
    }

    // Determine if this is a large data range
    const isLargeRange = rangeKey === '30d' || rangeKey === '365d' || rangeKey === '7d' || 
      (rangeKey === 'custom' && customApplied && 
       (endTime - startTime) > 24 * 60 * 60 * 1000); // > 24 hours
       
    // Adjust interval based on range size for better visualization
    const adjustedInterval = isLargeRange ? 
      (rangeKey === '365d' ? 6 * 60 * 60 * 1000 : // 6 hours for 365d 
        (rangeKey === '30d' ? 60 * 60 * 1000 :    // 1 hour for 30d
          30 * 60 * 1000)                         // 30 min for 7d
      ) : intervalMs;
    
    console.log(`Using adjusted interval for range ${rangeKey}:`, {
      standard: intervalMs,
      adjusted: adjustedInterval,
      isLargeRange
    });

    const fetchData = async () => {
      try {
        console.log('Starting historical data fetch with fields:', FIELDS);
        const data = await fetchHistoricalData(selectedLocations, rangeKey, FIELDS);
        
        if (!isMounted) return;

        console.log('Processing historical data for chart:', 
          Object.entries(data).map(([loc, items]) => `${loc}: ${items.length} records`));
        
        // Process data for each location
        Object.entries(data).forEach(([location, locationData]) => {
          FIELDS.forEach(field => {
            const fieldData = locationData.filter(d => {
              const fieldMatch = d.field === field || getMatchingField(d.field, field);
              if (!fieldMatch) {
                // Use debug level logging instead of console.log to reduce console spam
                if (typeof console.debug === 'function') {
                  console.debug(`Field mismatch: expected '${field}', got '${d.field}'`);
                }
              }
              return fieldMatch;
            });
            
            if (fieldData.length > 0) {
              console.log(`Found ${fieldData.length} points for ${location} - ${field}`);
              // Process data with optimized sampling using the adjusted interval
              const processedData = processTimeSeriesData(
                fieldData.map(d => ({ time: new Date(d.timestamp).getTime(), value: d.value })),
                startTime,
                endTime,
                adjustedInterval // Use the adjusted interval based on range
              );

              setHistoricalChartData(prev => ({
                ...prev,
                [location]: {
                  ...(prev[location] || {}),
                  [field]: processedData,
                },
              }));
            } else {
              console.log(`No data found for ${location} - ${field}`);
            }
          });
        });
      } catch (error) {
        console.error('Error fetching historical data:', error);
        if (handleError) handleError(error, 'fetch-historical-data');
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedLocations, rangeKey, customStart, customEnd, customApplied, handleError, processTimeSeriesData]);

  /**
   * Generate heatmap series data based on current settings
   */
  const heatmapSeries = useMemo(() => {
    if (selectedLocations.length === 0 || rangeKey === 'live') return [];
    
    const sensor = selectedLocations[0];
    const data = historicalChartData[sensor]?.[heatmapField] || [];
    
    if (rangeKey === '365d' || rangeKey === '180d' || rangeKey === '30d' || rangeKey === 'custom') {
      return prepareDailyHeatmapData(data);
    }
    
    const aggregatorWindow = HEATMAP_AGGREGATORS[rangeKey] || '1h';
    return prepareHeatmapData(data, aggregatorWindow);
  }, [selectedLocations, historicalChartData, rangeKey, heatmapField]);

  // Optimize series generation for multiple locations
  const apexSeries = useMemo(() => {
    const seriesList = [];
    
    selectedLocations.forEach(loc => {
      FIELDS.forEach(field => {
        const data = rangeKey === 'live' 
          ? (chartData[loc]?.[field] || [])
          : (historicalChartData[loc]?.[field] || []);
        
        if (data.length > 0) {
          // Ensure each location gets a unique series
          seriesList.push({
            name: `${loc} - ${field}`,
            data: data.map(d => ({
              x: d.time,
              y: typeof d.value === 'number' ? Number(d.value.toFixed(2)) : d.value
            })),
            location: loc,
            field: field
          });
        }
      });
    });
    
    return seriesList;
  }, [selectedLocations, chartData, historicalChartData, rangeKey]);

  // Initialize sensor data on mount with flag to avoid zoom resets
  useEffect(() => {
    // Create a flag to indicate this is an auto-refresh update
    window.__isAutoRefreshUpdate = false;
    
    fetchLocations();
    fetchSensors();
    
    // Set up interval for regular sensor updates
    const interval = setInterval(() => {
      // Set flag before fetching to indicate this is an auto-refresh
      window.__isAutoRefreshUpdate = true;
      
      fetchSensors()
        .catch(err => console.error('Error in periodic sensor fetch:', err))
        .finally(() => {
          // Reset the flag after a short delay to ensure chart updates have processed
          setTimeout(() => {
            window.__isAutoRefreshUpdate = false;
          }, 500);
        });
    }, 5000);
    
    return () => {
      clearInterval(interval);
      window.__isAutoRefreshUpdate = false;
    };
  }, [fetchLocations, fetchSensors]);

  /**
   * Check if chart data is multi-year for calendar display
   */
  const isMultiYear = useMemo(() => 
    rangeKey === 'custom' &&
    customStart && 
    customEnd && 
    new Date(customEnd).getFullYear() - new Date(customStart).getFullYear() >= 1
  , [rangeKey, customStart, customEnd]);

  /**
   * Split data by year for multi-year charts
   */
  const yearlyData = useMemo(() => {
    if (!isMultiYear || !heatmapSeries.length) return {};
    return splitDataByYear(heatmapSeries[0].data, customStart, customEnd);
  }, [isMultiYear, heatmapSeries, customStart, customEnd]);

  return {
    // Sensor lists
    allSensors,
    visibleLocationSensors,
    visibleCardSensors,
    
    // Location data
    locations,
    loadingLocations,
    
    // Real-time data
    mqttData,
    lastSeen,
    chartData,
    
    // Historical data
    historicalChartData,
    
    // Chart data
    heatmapSeries,
    apexSeries,
    
    // Calendar data
    isMultiYear,
    yearlyData,
    
    // Data loading
    fetchSensors,
    fetchLocations,
  };
}

export default useSensorData;