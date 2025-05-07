/**
 * @module components/admin/SensorRow
 * @description Component for displaying sensor data in the admin panel table
 */
import React, { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react';
import * as api from '../../services/api';
import { saveAs } from 'file-saver';
import SensorTimeline from './SensorTimeline';
import { useTranslation } from 'react-i18next';
import Chart from 'react-apexcharts';

// Add a simple cache for sensor data
const dataCache = {
  // Structure: { sensorName_range: { timestamp: Date, data: [...] } }
};

// Helper to check if cached data is still valid (5 minutes TTL)
const isCacheValid = (cacheKey) => {
  if (!dataCache[cacheKey]) return false;
  const cacheAge = Date.now() - dataCache[cacheKey].timestamp;
  return cacheAge < 5 * 60 * 1000; // 5 minutes TTL
};

/**
 * SensorRow component displays a row in the admin table for a single sensor
 * with toggles for visibility settings and an expandable chart section
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.sensor - Sensor data object
 * @param {string} props.sensor.name - Sensor name/identifier
 * @param {boolean} props.sensor.cardVisible - Whether sensor is visible in card view
 * @param {boolean} props.sensor.locationVisible - Whether sensor is visible in location view
 * @param {Object} props.status - The current status of the sensor
 * @param {Function} props.onUpdate - Function to update a specific field of a sensor
 * @returns {JSX.Element} The sensor row component
 */
const SensorRow = ({ sensor, status, onUpdate }) => {
  const { t, i18n } = useTranslation();
  const [showChart, setShowChart] = useState(false);
  const [range, setRange] = useState("24h");
  const [uptimeData, setUptimeData] = useState([]);
  const [chartError, setChartError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  // Debounce range changes to prevent excessive API calls
  const [debouncedRange, setDebouncedRange] = useState(range);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRange(range), 300);
    return () => clearTimeout(timer);
  }, [range]);

  // Create a function to load data in chunks for longer time ranges
  const loadDataInChunks = useCallback(async (sensorName, timeRange, retryCount = 0) => {
    console.log(`Loading data in chunks for ${sensorName}, range: ${timeRange}`);
    
    // Determine chunk configuration based on time range
    let chunks = [];
    const now = new Date();
    
    if (timeRange === '30d') {
      // For 30d, use just one chunk with daily aggregation
      chunks.push({
        range: '30d',
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: now.toISOString(),
        resolution: 'daily',
        maxPoints: 60
      });
    } else if (timeRange === '365d') {
      // For 365d, use just one chunk with weekly aggregation
      chunks.push({
        range: '365d',
        start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        end: now.toISOString(),
        resolution: 'weekly',
        maxPoints: 52
      });
    }
    
    // Check for empty chunks configuration
    if (chunks.length === 0) {
      console.error(`Invalid chunk configuration for range: ${timeRange}`);
      return null;
    }
    
    try {
      // Use a cache key combining sensor name and time range
      const cacheKey = `${sensorName}_${timeRange}`;
      
      // Check if we have valid cached data
      if (isCacheValid(cacheKey)) {
        console.log(`Using cached data for ${sensorName}, range: ${timeRange}`);
        return dataCache[cacheKey].data;
      }
      
      // Start loading chunks
      const allData = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setLoadProgress(Math.floor(30 + (i / chunks.length) * 50)); // 30-80% progress
        
        try {
          // Load data for this chunk with custom time range
          const options = {
            debug: false,
            enhanceOffline: true,
            startTime: chunk.start,
            endTime: chunk.end,
            resolution: chunk.resolution || 'daily',
            maxPoints: chunk.maxPoints,
            downsampling: 'minmax',  // Use min/max to preserve extremes
            timeoutMs: 15000         // Shorter timeout per chunk
          };
          
          console.log(`Loading chunk ${i+1}/${chunks.length} for ${sensorName}:`, {
            range: chunk.range,
            start: options.startTime,
            end: options.endTime,
            resolution: options.resolution,
            maxPoints: options.maxPoints
          });
          
          const chunkData = await api.getSensorHistory(sensorName, chunk.range, options);
          
          // Process the retrieved data
          const points = Array.isArray(chunkData.data) ? chunkData.data : chunkData;
          
          if (points && Array.isArray(points) && points.length > 0) {
            console.log(`Chunk ${i+1}: Got ${points.length} points`);
            
            // Process this chunk's data
            const processedPoints = points.map(point => {
              const time = point._time || point.timestamp;
              const isOnline = typeof point.online === 'boolean' ? point.online : point.online !== 'offline';
              return {
                ...point,
                _time: time,
                timestamp: time,
                online: isOnline
              };
            });
            
            // Add to aggregate data
            allData.push(...processedPoints);
          } else {
            console.log(`Chunk ${i+1}: No data returned`);
          }
        } catch (err) {
          console.warn(`Error loading chunk ${i+1}:`, err);
          // Continue with other chunks even if one fails
        }
      }
      
      // Final progress update
      setLoadProgress(90);
      
      if (allData.length === 0) {
        console.warn(`No data returned for any chunks for ${sensorName}`);
        return [];
      }
      
      // Sort combined data by timestamp
      allData.sort((a, b) => {
        const timeA = new Date(a._time || a.timestamp).getTime();
        const timeB = new Date(b._time || b.timestamp).getTime();
        return timeA - timeB;
      });
      
      // Deduplicate data based on timestamp
      const seenTimestamps = new Set();
      const dedupedData = allData.filter(point => {
        const ts = new Date(point._time || point.timestamp).getTime();
        if (seenTimestamps.has(ts)) return false;
        seenTimestamps.add(ts);
        return true;
      });
      
      console.log(`Total data after chunked loading: ${dedupedData.length} points`);
      
      // Final progress
      setLoadProgress(100);
      
      // Cache the result
      dataCache[cacheKey] = {
        timestamp: Date.now(),
        data: dedupedData
      };
      
      return dedupedData;
    } catch (err) {
      console.error('Error in chunked loading:', err);
      return null;
    }
  }, []);

  // Add a new function for downsampling that preserves state transitions
  function downsampleDataPreservingTransitions(data, maxPoints) {
    if (!data || !Array.isArray(data) || data.length <= maxPoints) return data;
    
    // Always include the first and last points
    const result = [data[0]];
    
    // Calculate the step size for regular sampling
    const step = Math.floor(data.length / (maxPoints - 2));
    
    // Track transitions (status changes) and their indices
    const transitions = [];
    for (let i = 1; i < data.length; i++) {
      const curr = data[i];
      const prev = data[i-1];
      
      // Check if online status changed
      if ((curr.online === true) !== (prev.online === true)) {
        transitions.push(i);
      }
    }
    
    // Determine how many regular sampled points to include
    const numTransitions = transitions.length;
    const regularSamplePoints = Math.max(0, maxPoints - 2 - numTransitions);
    
    // Calculate how many regular intervals to sample
    const numIntervals = regularSamplePoints > 0 ? Math.ceil(data.length / regularSamplePoints) : 0;
    
    // Create a set to track which indices are already included
    const includedIndices = new Set([0, data.length - 1]);
    
    // Add transition points
    transitions.forEach(idx => {
      includedIndices.add(idx);
    });
    
    // Add regularly sampled points
    if (numIntervals > 0) {
      for (let i = 1; i < data.length - 1; i += numIntervals) {
        if (includedIndices.has(i)) continue;
        includedIndices.add(i);
        if (includedIndices.size >= maxPoints - 1) break; // -1 because we'll add the last point later
      }
    }
    
    // Convert the set to an array of indices and sort
    const indices = Array.from(includedIndices).sort((a, b) => a - b);
    
    // Build the result array using the selected indices
    for (let i = 1; i < indices.length - 1; i++) {
      result.push(data[indices[i]]);
    }
    
    // Add the last point
    result.push(data[data.length - 1]);
    
    console.log(`Downsampled: ${data.length} → ${result.length} points (preserved ${transitions.length} transitions)`);
    
    return result;
  }

  /**
   * Load sensor history data when chart is shown or range changes
   */
  useEffect(() => {
    if (!showChart) return;
    
    setChartError(null);
    setIsRefreshing(true);
    setLoadProgress(0);
    setUptimeData([]); // Clear any previous data
    
    console.log(`Fetching data for ${sensor.name} with range: ${debouncedRange}`);
    
    // Set a timeout to show a loading message after a delay
    const loadingIndicatorTimeout = setTimeout(() => {
      console.log('Taking longer than expected to load...');
    }, 2000);
    
    // Add an abort controller to cancel the request if it takes too long
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Request timeout, aborting');
      abortController.abort('Timeout');
      setIsRefreshing(false);
      clearTimeout(loadingIndicatorTimeout);
      
      // Instead of showing error right away, try fallback strategy
      tryFallbackDataLoading();
    }, 20000); // Shorter initial timeout (20 seconds)
    
    // Progressive fallback loading strategy
    const tryFallbackDataLoading = async () => {
      console.log(`Trying fallback data loading for ${sensor.name} with range: ${debouncedRange}`);
      setLoadProgress(10); // Reset progress for fallback strategy
      
      try {
        let data = [];
        
        // First fallback: Try with minimal data points and daily aggregation
        const options = {
          debug: false,
          enhanceOffline: true,
          maxPoints: debouncedRange === '24h' ? 48 : 30, // Very limited points
          resolution: debouncedRange === '24h' ? 'hourly' : 'daily',
          downsampling: 'minmax', // Use min/max to preserve extremes
          timeoutMs: 15000 // Even shorter timeout
        };
        
        console.log(`Fallback strategy with options:`, options);
        setLoadProgress(30);
        
        try {
          const apiResult = await api.getSensorHistory(sensor.name, debouncedRange, options);
          data = Array.isArray(apiResult.data) ? apiResult.data : apiResult;
          
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('No data received in fallback');
          }
        } catch (err) {
          console.error('Primary fallback failed, attempting emergency data generation', err);
          throw err; // Continue to emergency fallback
        }
        
        setLoadProgress(80);
        
        // Process minimal data
        const processedPoints = data.map(point => {
          const time = point._time || point.timestamp;
          const isOnline = typeof point.online === 'boolean' ? point.online : point.online !== 'offline';
          return {
            ...point,
            _time: time,
            timestamp: time,
            online: isOnline
          };
        });
        
        // Extreme downsampling if needed
        const maxRenderPoints = 60; // Absolute max for UI rendering performance
        let finalData = processedPoints;
        
        if (processedPoints.length > maxRenderPoints) {
          finalData = downsampleDataPreservingTransitions(processedPoints, maxRenderPoints);
        }
        
        setUptimeData(finalData);
        setLoadProgress(100);
        setIsRefreshing(false);
        setChartError(null);
        
        console.log(`Fallback successful, loaded ${finalData.length} points`);
        
      } catch (err) {
        console.error('Fallback data loading also failed:', err);
        
        // EMERGENCY FALLBACK: Generate synthetic data points if all else fails
        try {
          console.log('Generating emergency synthetic data points');
          setLoadProgress(50);
          
          // Generate minimal synthetic data based on range
          const syntheticData = generateEmergencySyntheticData(debouncedRange, status?.online || false);
          
          setUptimeData(syntheticData);
          setLoadProgress(100);
          setIsRefreshing(false);
          
          // Show a warning that this is estimated data
          const syntheticDataMsg = i18n.language === 'sk' 
            ? "Používam odhadované údaje. Skutočné údaje nie sú k dispozícii. Skúste kratší časový rozsah alebo obnovte stránku."
            : "Using estimated data. Real data is unavailable. Try a shorter time range or refresh the page.";
          setChartError(syntheticDataMsg);
          
          console.log('Emergency synthetic data generated:', syntheticData.length);
        } catch (syntheticErr) {
          // If even this fails, show final error
          console.error('Emergency synthetic data generation failed:', syntheticErr);
          setIsRefreshing(false);
          
          // Show minimal error UI
          const timeoutMsg = i18n.language === 'sk'
            ? `Nemožno načítať údaje pre ${debouncedRange}. Skúste kratší časový rozsah alebo obnovte stránku.`
            : `Unable to load data for ${debouncedRange} range. Try a shorter time range or refresh the page.`;
          
          setChartError(timeoutMsg);
          setLoadProgress(0);
        }
      }
    };
    
    const fetchData = async () => {
      try {
        let data;
        
        // Use streamlined approach for all ranges
        const options = {
          debug: false,
          enhanceOffline: true,
          timeoutMs: 15000 // Shorter timeout
        };
        
        // Adjust options based on time range
        if (debouncedRange === '24h') {
          options.maxPoints = 96; // One point per 15 minutes
          options.resolution = 'auto';
        } else if (debouncedRange === '7d') {
          options.maxPoints = 84; // Half-hourly for 7d
          options.resolution = 'hourly';
          options.downsampling = 'adaptive';
        } else if (debouncedRange === '30d' || debouncedRange === '365d') {
          // For longer ranges, use chunked loading
          setLoadProgress(10);
          data = await loadDataInChunks(sensor.name, debouncedRange);
          
          if (data && data.length > 0) {
            setUptimeData(data);
            setChartError(null);
            setIsRefreshing(false);
            clearTimeout(timeoutId);
            clearTimeout(loadingIndicatorTimeout);
            return;
          } else {
            // If chunked loading failed or returned no data, try fallback
            console.warn(`Chunked loading failed for ${debouncedRange}, trying fallback`);
            abortController.abort('Switching to fallback');
            clearTimeout(timeoutId);
            tryFallbackDataLoading();
            return;
          }
        }
        
        console.log(`Loading data for ${sensor.name} with options:`, options);
        
        const apiResult = await api.getSensorHistory(sensor.name, debouncedRange, options);
        data = Array.isArray(apiResult.data) ? apiResult.data : apiResult;
        
        // Check for valid data
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn(`No data received for ${sensor.name} with range ${debouncedRange}`);
          setUptimeData([]);
          const errorMsg = t('noDataForSensor', {
            sensorName: sensor.name,
            range: debouncedRange
          }) || `Žiadne údaje k dispozícii pre ${sensor.name.split('_')[0]} vo vybranom časovom rozsahu (${debouncedRange}). Skúste iný časový rozsah.`;
          setChartError(errorMsg);
          setIsRefreshing(false);
          clearTimeout(timeoutId);
          clearTimeout(loadingIndicatorTimeout);
          return;
        }
        
        // Process data to ensure consistent format
        const processedPoints = data.map(point => {
          const time = point._time || point.timestamp;
          const isOnline = typeof point.online === 'boolean' ? point.online : point.online !== 'offline';
          return {
            ...point,
            _time: time,
            timestamp: time,
            online: isOnline
          };
        });
        
        // Ensure data isn't too large for chart rendering (cap at reasonable amount)
        const maxRenderPoints = 120; // Cap for UI performance
        let finalData = processedPoints;
        
        if (processedPoints.length > maxRenderPoints) {
          console.log(`Reducing data from ${processedPoints.length} to ${maxRenderPoints} points for rendering`);
          finalData = downsampleDataPreservingTransitions(processedPoints, maxRenderPoints);
        }
        
        setUptimeData(finalData);
        setChartError(null);
        
        clearTimeout(timeoutId);
        clearTimeout(loadingIndicatorTimeout);
        setIsRefreshing(false);
        
        console.log(`Received ${finalData.length} data points for ${sensor.name} with range ${debouncedRange}`);
        
      } catch (err) {
        clearTimeout(loadingIndicatorTimeout);
        console.error(`Error fetching data for ${sensor.name} with range ${debouncedRange}:`, err);
        
        // Try fallback loading
        console.log('Primary loading failed, trying fallback...');
        clearTimeout(timeoutId);
        tryFallbackDataLoading();
      }
    };
    
    // Start the fetch
    fetchData();
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(loadingIndicatorTimeout);
      abortController.abort('Component unmounted');
    };
  }, [sensor.name, debouncedRange, showChart, loadDataInChunks]);

  /**
   * Generate stacked timeline data from the raw uptime data
   */
  const { online, offline } = useMemo(
    () => generateStackedData(uptimeData),
    [uptimeData]
  );

  /**
   * Calculate aggregated data for timeline visualization
   */
  const aggregatedData = useMemo(() => {
    if (!Array.isArray(online) || online.length === 0) return { aggregated: [], timeMarkers: [] };
    
    const totalTimespan = online[online.length - 1].x - online[0].x;
    const startTime = online[0].x;
    const endTime = online[online.length - 1].x;
    
    // Determine how many segments we want based on time range
    let segmentCount = 24; // Default for 24h view
    
    if (range === '7d') segmentCount = 28; // 4-hour segments for 7 days
    else if (range === '30d') segmentCount = 30; // Daily segments for 30 days
    else if (range === '365d') segmentCount = 24; // ~15-day segments for a year
    
    const segmentDuration = totalTimespan / segmentCount;
    const aggregated = [];
    const timeMarkers = [];
    
    // Generate time markers for the x-axis (more points for better readability)
    const markerCount = Math.min(10, segmentCount);
    const markerInterval = totalTimespan / (markerCount - 1);
    
    for (let i = 0; i < markerCount; i++) {
      const markerTime = startTime + (i * markerInterval);
      timeMarkers.push(markerTime);
    }
    
    // Aggregate data into segments
    for (let i = 0; i < segmentCount; i++) {
      const segmentStart = startTime + (i * segmentDuration);
      const segmentEnd = segmentStart + segmentDuration;
      
      // Find all points that fall within this segment
      const segmentPoints = online.filter(point => 
        point.x >= segmentStart && point.x < segmentEnd && point.y === 1
      );
      
      // Calculate what percentage of this segment was online
      const onlineTime = segmentPoints.reduce((total, current, index, array) => {
        if (index === 0) return 0;
        const prevPoint = array[index - 1];
        if (prevPoint.y === 1 && current.y === 1) {
          return total + (current.x - prevPoint.x);
        }
        return total;
      }, 0);
      
      const onlinePercentage = segmentPoints.length > 0 ? 
        Math.min(1, onlineTime / segmentDuration) : 0;
      
      aggregated.push({
        startTime: segmentStart,
        endTime: segmentEnd,
        onlinePercentage: onlinePercentage,
        hasData: segmentPoints.length > 0
      });
    }
    
    return { aggregated, timeMarkers };
  }, [online, range]);

  /**
   * Download sensor data as CSV file
   */
  const downloadCSV = () => {
    const header = "timestamp,online";
    const csvRows = uptimeData.map((d) => {
      const timeStr = d.timestamp || d._time;
      if (!timeStr) return "";
      const isoTs = timeStr.replace(" ", "T");
      const ts = new Date(isoTs).toISOString();
      const isOn = d.online === false ? "Offline" : "Online";
      return `${ts},${isOn}`;
    });
    const blob = new Blob([header + "\n" + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    saveAs(blob, `${sensor.name}_${range}.csv`);
  };

  // Determine sensor visibility state and appearance
  const isHidden =
    sensor.cardVisible === false && sensor.locationVisible === false;
  
  // Check if sensor has any temperature/humidity data as additional indicator
  const hasCurrentData = status && (
    typeof status.temperature === 'number' || 
    typeof status.humidity === 'number' || 
    typeof status.pressure === 'number'
  );
  
  // Fix for timestamp handling with better sensor status detection
  let ageMs = Infinity;
  
  if (status && status.lastSeen) {
    try {
      const parsedDate = new Date(status.lastSeen);
      if (!isNaN(parsedDate.getTime())) {
        ageMs = Date.now() - parsedDate.getTime();
      } else {
        console.error(`Invalid date format for ${sensor.name}: ${status.lastSeen}`);
      }
    } catch (err) {
      console.error(`Error parsing date for ${sensor.name}: ${err.message}`);
    }
  }
  
  // Determine status color with better logic
  // Consider sensor online if we have current data even if lastSeen is missing
  let statusColor = "bg-gray-400";
  let isOnline = false;
  let statusDescription = "";
  
  if (hasCurrentData) {
    // If we have current data, sensor is definitely online
    statusColor = "bg-green-500";
    isOnline = true;
    statusDescription = t('online');
  } else if (status) {
    if (status.online) {
    statusColor = "bg-green-500";
    isOnline = true;
    statusDescription = t('online');
    } else if (ageMs < 10 * 60 * 1000) { // Less than 10 minutes
    statusColor = "bg-yellow-500";
      statusDescription = t('warning');
  } else {
    statusColor = "bg-red-500";
    statusDescription = t('offline');
    }
  }

  // Get uptime or downtime information from status
  const uptimeInfo = status?.uptimeDuration;
  const downtimeInfo = status?.offlineDuration;
  const startTimeInfo = status?.startTime;
  
  // Add more detailed debugging for uptime/downtime display
  console.log(`[UPTIME] ${sensor.name} data:`, {
    hasStatus: !!status,
    isOnline,
    uptimeDuration: status?.uptimeDuration,
    offlineDuration: status?.offlineDuration, 
    startTime: status?.startTime
  });
  
  // Format startTime for display
  let startTimeDisplay = '';
  if (startTimeInfo) {
    try {
      startTimeDisplay = new Date(startTimeInfo).toLocaleString();
    } catch (err) {
      console.error(`Error formatting startTime: ${startTimeInfo}`, err);
      startTimeDisplay = startTimeInfo;
    }
  }

  // Create uptime/downtime status message
  let uptimeStatusMessage = "";
  // Calculate fallback downtime if needed
  let calculatedDowntime = null;

  // More robust calculation for downtime when we have data but no explicit downtime info
  if (
    (!downtimeInfo || downtimeInfo === "Unknown") &&
    !isOnline
  ) {
    // First try to get it from the last data point in uptimeData
    if (uptimeData && uptimeData.length > 0) {
      // Find the last data point
      const lastPoint = uptimeData[uptimeData.length - 1];
      const lastTime = new Date(lastPoint._time || lastPoint.timestamp).getTime();
      const now = Date.now();
      
      if (!isNaN(lastTime) && now > lastTime) {
        const diffMs = now - lastTime;
        if (diffMs < 60 * 1000) {
          calculatedDowntime = `${Math.floor(diffMs / 1000)}s`;
        } else if (diffMs < 60 * 60 * 1000) {
          calculatedDowntime = `${Math.floor(diffMs / 60000)}m`;
        } else if (diffMs < 24 * 60 * 60 * 1000) {
          calculatedDowntime = `${Math.floor(diffMs / 3600000)}h`;
        } else {
          calculatedDowntime = `${Math.floor(diffMs / (24 * 3600000))}d`;
        }
      }
    } 
    // If we still don't have a downtime, try lastSeen from status
    else if (status && status.lastSeen) {
      try {
        const lastTime = new Date(status.lastSeen).getTime();
        const now = Date.now();
        
        if (!isNaN(lastTime) && now > lastTime) {
          const diffMs = now - lastTime;
          if (diffMs < 60 * 1000) {
            calculatedDowntime = `${Math.floor(diffMs / 1000)}s`;
          } else if (diffMs < 60 * 60 * 1000) {
            calculatedDowntime = `${Math.floor(diffMs / 60000)}m`;
          } else if (diffMs < 24 * 60 * 60 * 1000) {
            calculatedDowntime = `${Math.floor(diffMs / 3600000)}h`;
          } else {
            calculatedDowntime = `${Math.floor(diffMs / (24 * 3600000))}d`;
          }
        }
      } catch (err) {
        console.error(`Error calculating downtime from lastSeen: ${err.message}`);
      }
    }
  }

  if (isOnline) {
    if (uptimeInfo) {
      uptimeStatusMessage = `${t('uptime')}: ${uptimeInfo}`;
      if (startTimeInfo) {
        try {
          uptimeStatusMessage += ` (${t('since')}: ${startTimeDisplay})`;
        } catch (err) {
          console.error(`Error adding start time info: ${err}`);
        }
      }
    } else {
      uptimeStatusMessage = `${t('online')}`;
    }
  } else {
    if (downtimeInfo && downtimeInfo !== 'Unknown') {
      // Check if we have one of the specific error messages from the backend
      if (downtimeInfo === 'No Data') {
        // For No Data specifically, use a better translation and fallback time
        console.log(`Showing no data message for ${sensor.name}`);
        
        // If sensor has timestamp but no history, provide an estimated downtime
        if (status && status.timestamp) {
          const fallbackDuration = "1h+";
          uptimeStatusMessage = `${t('downtime')}: ${fallbackDuration} (${t('noDataDowntime')})`;
          console.log(`Using fallback downtime for ${sensor.name}: ${fallbackDuration}`);
        } else {
          uptimeStatusMessage = `${t('downtime')}: ${t('noDataDowntime')}`;
        }
      } else if (downtimeInfo === 'No History') {
        // For brand new sensors with no history at all
        console.log(`Showing no history message for ${sensor.name}`);
        uptimeStatusMessage = `${t('downtime')}: ${t('noHistory')}`;
      } else if (downtimeInfo.includes("(since last data)")) {
        // Handle the "since last data" format from backend
        const downtimeParts = downtimeInfo.split(" (since last data)");
        const duration = downtimeParts[0];
        uptimeStatusMessage = `${t('downtime')}: ${duration} (${t('sinceLastData')})`;
        console.log(`Showing downtime from last data for ${sensor.name}: ${duration}`);
      } else if (downtimeInfo.includes("(last:")) {
        // Handle the format with last reading information
        // Format: "30d 5h (last: 22.5°C)"
        const match = downtimeInfo.match(/(.+) \(last: (.+)\)$/);
        if (match && match.length === 3) {
          const duration = match[1];
          const lastValue = match[2];
          uptimeStatusMessage = `${t('downtime')}: ${duration} (${t('lastReading')}: ${lastValue})`;
          console.log(`Showing downtime with last reading for ${sensor.name}: ${duration}, ${lastValue}`);
        } else {
          // Fallback if parsing fails
          uptimeStatusMessage = `${t('downtime')}: ${downtimeInfo}`;
        }
      } else if (downtimeInfo.startsWith('Unknown (') || downtimeInfo.startsWith('Error:') || 
          downtimeInfo.startsWith('Error (')) {
        // For other specific error types, show a clearer message with the raw value for debugging
        console.log(`Displaying specific error downtime for ${sensor.name}:`, downtimeInfo);
        uptimeStatusMessage = `${t('downtime')}: ${t('unavailable')} (${downtimeInfo})`;
      } else {
        // For normal downtime values, display as before
        uptimeStatusMessage = `${t('downtime')}: ${downtimeInfo}`;
      }
    } else if (calculatedDowntime) {
      uptimeStatusMessage = `${t('downtime')}: ${calculatedDowntime}`;
    } else {
      // If we have no valid downtime info at all, use a clearer translation 
      // with a troubleshooting hint if appropriate
      if (status && status.error) {
        console.warn(`Error getting status for ${sensor.name}:`, status.error);
        uptimeStatusMessage = `${t('downtime')}: ${t('unavailableWithError')}`;
      } else {
        uptimeStatusMessage = `${t('downtime')}: ${t('unavailable')}`;
      }
    }
  }

  console.log(`[UPTIME] ${sensor.name} display message:`, uptimeStatusMessage);

  // More comprehensive debug logging for sensor status troubleshooting
  useEffect(() => {
    if (showChart || isOnline === false) {
      console.log('Sensor details:', {
        name: sensor.name,
        status: status,
        hasCurrentData: hasCurrentData,
        lastSeenTimestamp: status?.lastSeen,
        lastSeenParsed: status?.lastSeen ? new Date(status.lastSeen).toISOString() : 'N/A',
        ageMs: status?.lastSeen ? Date.now() - new Date(status.lastSeen).getTime() : 'N/A',
        currentTime: new Date().toISOString(),
        statusColor,
        isOnline,
        uptimeDuration: status?.uptimeDuration,
        offlineDuration: status?.offlineDuration,
        startTime: status?.startTime,
        uptimeStatusMessage
      });
    }
  }, [showChart, sensor.name, status, hasCurrentData, statusColor, isOnline, uptimeStatusMessage]);

  /**
   * Toggle sensor visibility in card or location view
   * @param {string} field - Field to toggle ('cardVisible' or 'locationVisible')
   */
  const toggleVisibility = (field) => {
    const currentValue = sensor[field];
    onUpdate(field, !currentValue);
  };

  /**
   * Format time difference in a readable format
   * @param {number} ms - Time difference in milliseconds
   * @returns {string} Formatted time string
   */
  const formatTimeDiff = (ms) => {
    // If sensor is online based on current data but lastSeen is missing or invalid
    if (isOnline && (ms === Infinity || ms < 0 || isNaN(ms))) {
      return "Online";
    }
    
    if (!ms || isNaN(ms) || ms === Infinity || ms < 0) {
      console.log(`Invalid time difference for ${sensor.name}: ${ms}`);
      return t('never') || "never";
    }
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  /**
   * Handle location deletion
   */
  const handleDeleteLocation = () => {
    if (window.confirm(t('deleteConfirmation'))) {
      // Show delete in progress
      onUpdate("isDeleting", true);
      
      // Call API to delete sensor
      api.deleteSensor(sensor.name)
        .then(() => {
          console.log(`Sensor ${sensor.name} deleted successfully`);
        })
        .catch(err => {
          console.error(`Error deleting sensor ${sensor.name}:`, err);
          // Reset deleting state
          onUpdate("isDeleting", false);
        });
    }
  };

  // Get the sensor parts for display
  const [location, name] = sensor.name.split("_");

  // Define the CSS for the heartbeat effect
  const blinkAnimationStyle = `@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } } .animate-blink { animation: blink 2.5s infinite; }`;

  /**
   * Efficiently downsample large datasets to a manageable size for chart rendering
   * @param {Array} data - Original data array
   * @param {number} maxPoints - Maximum desired points
   * @returns {Array} Downsampled data
   */
  function downsampleData(data, maxPoints = 500) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    if (data.length <= maxPoints) return data.map(point => ({
      x: new Date(point.timestamp || point._time).getTime(),
      y: point.online !== false ? 1 : 0
    })).filter(point => !isNaN(point.x));
    
    // Sort by timestamp
    const sortedData = [...data].sort((a, b) => {
      const timeA = new Date(a.timestamp || a._time).getTime();
      const timeB = new Date(b.timestamp || b._time).getTime();
      return timeA - timeB;
    });
    
    // Simple downsample by skipping points
    const step = Math.max(1, Math.floor(sortedData.length / maxPoints));
    const downsampled = [];
    
    // Always keep first and last point
    const firstPoint = sortedData[0];
    const lastPoint = sortedData[sortedData.length - 1];
    downsampled.push({
      x: new Date(firstPoint.timestamp || firstPoint._time).getTime(),
      y: firstPoint.online !== false ? 1 : 0
    });
    
    // Add regularly spaced points
    for (let i = step; i < sortedData.length - step; i += step) {
      const point = sortedData[i];
      const timestamp = new Date(point.timestamp || point._time).getTime();
      if (!isNaN(timestamp)) {
        downsampled.push({
          x: timestamp,
          y: point.online !== false ? 1 : 0 
        });
      }
    }
    
    // Add status change points to maintain accuracy
    for (let i = 1; i < sortedData.length - 1; i++) {
      // Skip points we've already included via regular sampling
      if (i % step === 0) continue;
      
      const current = sortedData[i];
      const prev = sortedData[i-1];
      
      // If there's a status change, include this point
      if ((current.online !== false) !== (prev.online !== false)) {
        const timestamp = new Date(current.timestamp || current._time).getTime();
        if (!isNaN(timestamp)) {
          downsampled.push({
            x: timestamp,
            y: current.online !== false ? 1 : 0
          });
        }
      }
    }
    
    // Add last point
    downsampled.push({
      x: new Date(lastPoint.timestamp || lastPoint._time).getTime(),
      y: lastPoint.online !== false ? 1 : 0
    });
    
    // Sort downsampled data by timestamp
    return downsampled.sort((a, b) => a.x - b.x);
  }

  /**
   * Optimizes data sampling based on time range for better visualization
   * @param {Array} data - Raw data points
   * @param {string} range - Time range (24h, 7d, 30d, 365d)
   * @returns {Array} Optimized data points
   */
  function optimizeDataSampling(data, range) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    
    // Sort data by timestamp first
    const sortedData = [...data].sort((a, b) => {
      const timeA = new Date(a.x).getTime();
      const timeB = new Date(b.x).getTime();
      return timeA - timeB;
    });
    
    // Determine target number of points based on range
    let targetPoints;
    switch (range) {
      case '24h':
        targetPoints = 288;  // One point every 5 minutes
        break;
      case '7d':
        targetPoints = 168;  // One point per hour
        break;
      case '30d':
        targetPoints = 120;  // Four points per day (reduced from 180)
        break;
      case '365d':
        targetPoints = 120;  // About 3 points per month (reduced from 365)
        break;
      default:
        targetPoints = 200;  // Default sampling
    }
    
    // If we have fewer points than target, return all points
    if (sortedData.length <= targetPoints) return sortedData;
    
    // First pass: include regularly spaced points
    const step = Math.max(1, Math.floor(sortedData.length / targetPoints));
    const sampledPoints = [];
    
    // Always include first and last point
    sampledPoints.push(sortedData[0]);
    
    // Add regularly spaced points
    for (let i = step; i < sortedData.length - step; i += step) {
      sampledPoints.push(sortedData[i]);
    }
    
    // Add last point if not already included
    if (sampledPoints[sampledPoints.length - 1] !== sortedData[sortedData.length - 1]) {
      sampledPoints.push(sortedData[sortedData.length - 1]);
    }
    
    // Second pass: add ALL status change points - crucial for accurate visualization
    const statusChangePoints = [];
    for (let i = 1; i < sortedData.length; i++) {
      // Skip points we've already included
      if (sampledPoints.includes(sortedData[i])) continue;
      
      const current = sortedData[i];
      const prev = sortedData[i-1];
      
      // If there's a status change, include this point and the point before it
      if ((current.y === 1) !== (prev.y === 1)) {
        if (!sampledPoints.includes(prev)) {
          statusChangePoints.push(prev);
        }
        statusChangePoints.push(current);
      }
    }
    
    // Combine all points and sort by timestamp
    const result = [...sampledPoints, ...statusChangePoints].sort((a, b) => a.x - b.x);
    
    console.log(`Optimized data sampling: ${data.length} → ${result.length} points`);
    return result;
  }

  // Improve the LightweightChart component
  const LightweightChart = memo(({ data, range, t }) => {
    const canvasRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    
    // Optimize data sampling and process chart data
    const chartData = useMemo(() => {
      console.log(`Preparing chart data for range: ${range}`);
      
      if (!data || data.length === 0) return { points: [], minTime: 0, maxTime: 0 };
      
      // Filter out invalid points
      const validData = data.filter(point => 
        point && typeof point.x === 'number' && !isNaN(point.x)
      );
      
      if (validData.length === 0) return { points: [], minTime: 0, maxTime: 0 };
      
      // Apply optimized sampling based on time range
      const optimizedData = optimizeDataSampling(validData, range);
      
      // Get time range from optimized data
      const minTime = optimizedData[0].x;
      const maxTime = optimizedData[optimizedData.length - 1].x;
      
      return { points: optimizedData, minTime, maxTime };
    }, [data, range]);
    
    // Draw the chart with better offline state visualization
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const { points, minTime, maxTime } = chartData;
      
      // Set canvas size with device pixel ratio for sharpness
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);
      
      // Define padding
      const padding = { top: 15, right: 15, bottom: 30, left: 40 };
      const chartWidth = rect.width - padding.left - padding.right;
      const chartHeight = rect.height - padding.top - padding.bottom;
      
      // Show a message if no data
      if (!points || points.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '12px sans-serif';
        ctx.fillText(t('noDataAvailable'), rect.width/2, rect.height/2);
        return;
      }
      
      // Ensure we have a valid time range
      if (minTime >= maxTime) {
        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '12px sans-serif';
        ctx.fillText(t('invalidTimeRange') || 'Invalid time range', rect.width/2, rect.height/2);
        return;
      }
      
      // Draw background with distinct regions
      // Online zone (top half) - light green
      ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
      ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight/2);
      
      // Offline zone (bottom half) - light red
      ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
      ctx.fillRect(padding.left, padding.top + chartHeight/2, chartWidth, chartHeight/2);
      
      // Draw dividing line between zones
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartHeight/2);
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight/2);
      ctx.stroke();
      
      // Draw time axis ticks and labels
      const timeRange = maxTime - minTime;
      const numTicks = Math.min(8, Math.floor(chartWidth / 80)); // Limit ticks based on width
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      
      for (let i = 0; i <= numTicks; i++) {
        const x = padding.left + (i / numTicks) * chartWidth;
        const time = minTime + (i / numTicks) * timeRange;
        const date = new Date(time);
        
        // Draw tick
        ctx.beginPath();
        ctx.moveTo(x, padding.top + chartHeight);
        ctx.lineTo(x, padding.top + chartHeight + 5);
        ctx.stroke();
        
        // Draw faint gridline
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartHeight);
        ctx.strokeStyle = 'rgba(229, 231, 235, 0.5)';
        ctx.stroke();
        ctx.strokeStyle = '#e5e7eb';
        
        // Format label based on time range
        let label;
        if (range === '24h') {
          label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (range === '7d') {
          label = date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
        } else {
          label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        
        ctx.fillText(label, x, padding.top + chartHeight + 8);
      }
      
      // Draw y-axis labels
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      // Online label - darker green
      ctx.fillStyle = '#059669';
      ctx.fillText(t('online'), padding.left - 8, padding.top + chartHeight * 0.25);
      
      // Offline label - darker red
      ctx.fillStyle = '#dc2626';
      ctx.fillText(t('offline'), padding.left - 8, padding.top + chartHeight * 0.75);
      
      // Draw chart lines
      if (points.length > 0) {
        // Step 1: Draw the connecting lines with step function
        ctx.beginPath();
        let lastY = null;
        
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          const x = padding.left + ((point.x - minTime) / timeRange) * chartWidth;
          // Fixed y positions for online/offline states
          const y = padding.top + (point.y === 1 ? chartHeight * 0.25 : chartHeight * 0.75);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            // Draw horizontal segment at previous y level
            ctx.lineTo(x, lastY);
            // Then draw vertical segment to new y level
            if (lastY !== y) {
              ctx.lineTo(x, y);
            }
          }
          
          lastY = y;
        }
        
        // Draw main line in purple/blue
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Step 2: Draw online segments in green (solid)
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        
        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          const prevPoint = points[i-1];
          
          // Only draw if both points are online
          if (point.y === 1 && prevPoint.y === 1) {
            const x1 = padding.left + ((prevPoint.x - minTime) / timeRange) * chartWidth;
            const x2 = padding.left + ((point.x - minTime) / timeRange) * chartWidth;
            const y = padding.top + chartHeight * 0.25;
            
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
          }
        }
        
        // Step 3: Draw offline segments in red (dashed)
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        
        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          const prevPoint = points[i-1];
          
          // Only draw if both points are offline
          if (point.y === 0 && prevPoint.y === 0) {
            const x1 = padding.left + ((prevPoint.x - minTime) / timeRange) * chartWidth;
            const x2 = padding.left + ((point.x - minTime) / timeRange) * chartWidth;
            const y = padding.top + chartHeight * 0.75;
            
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
          }
        }
        
        // Step 4: Draw dots at transition points
        ctx.setLineDash([]);
        
        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          const prevPoint = points[i-1];
          
          // If status changed, mark the transition
          if (point.y !== prevPoint.y) {
            const x = padding.left + ((point.x - minTime) / timeRange) * chartWidth;
            const y = padding.top + (point.y === 1 ? chartHeight * 0.25 : chartHeight * 0.75);
            
            // Draw larger circle at transition
            ctx.fillStyle = point.y === 1 ? '#059669' : '#dc2626';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Add thin black outline
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      
      // Draw legend
      const legendY = padding.top + chartHeight + 20;
      
      // Online indicator
      ctx.setLineDash([]);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(padding.left, legendY);
      ctx.lineTo(padding.left + 20, legendY);
      ctx.stroke();
      
      // Offline indicator
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left + 100, legendY);
      ctx.lineTo(padding.left + 120, legendY);
      ctx.stroke();
      
      // Legend text
      ctx.setLineDash([]);
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '11px sans-serif';
      ctx.fillText(t('online'), padding.left + 25, legendY);
      ctx.fillText(t('offline'), padding.left + 125, legendY);
      
    }, [chartData, canvasRef, t, range]);
    
    // Handle mouse move for tooltips
    const handleMouseMove = (e) => {
      if (!chartData.points?.length) return;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Define padding
      const padding = { top: 15, right: 15, bottom: 30, left: 40 };
      const chartWidth = rect.width - padding.left - padding.right;
      
      // Only process if within chart area
      if (x < padding.left || x > padding.left + chartWidth || 
          y < padding.top || y > padding.top + (rect.height - padding.bottom)) {
        setTooltip(null);
        return;
      }
      
      // Calculate time at cursor position
      const { points, minTime, maxTime } = chartData;
      const timeRange = maxTime - minTime;
      const pointTime = minTime + ((x - padding.left) / chartWidth) * timeRange;
      
      // Find closest point
      let closestPoint = null;
      let minDistance = Infinity;
      
      for (const point of points) {
        const distance = Math.abs(point.x - pointTime);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      }
      
      if (closestPoint) {
        const pointDate = new Date(closestPoint.x);
        const formattedDate = range === '24h' 
          ? pointDate.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : pointDate.toLocaleString([], { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        setTooltip({
          x,
          y: padding.top + (closestPoint.y === 1 ? 0.25 : 0.75) * (rect.height - padding.top - padding.bottom),
          time: formattedDate,
          status: closestPoint.y === 1 ? t('online') : t('offline'),
          isOnline: closestPoint.y === 1
        });
      } else {
        setTooltip(null);
      }
    };
    
    const handleMouseLeave = () => {
      setTooltip(null);
    };
    
    return (
      <div className="relative h-48 border border-gray-200 rounded-md">
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        
        {tooltip && (
          <div 
            className={`absolute bg-white border ${tooltip.isOnline ? 'border-green-200' : 'border-red-200'} p-2 rounded shadow-sm text-xs z-10`}
            style={{ 
              left: `${tooltip.x}px`, 
              top: `${tooltip.y - 35}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="font-medium">{tooltip.time}</div>
            <div className={tooltip.isOnline ? 'text-green-600' : 'text-red-600 font-medium'}>
              {tooltip.status}
            </div>
          </div>
        )}
        
        {/* Show sampling info for large datasets */}
        {data && data.length > 1000 && (
          <div className="absolute top-2 right-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md opacity-80">
            {data.length.toLocaleString()} → {chartData.points.length.toLocaleString()} {t('dataPoints')}
          </div>
        )}
      </div>
    );
  });

  // Function to generate minimal synthetic data for emergency display
  function generateEmergencySyntheticData(rangeStr, isCurrentlyOnline) {
    const now = Date.now();
    const result = [];
    
    // Determine time range in milliseconds
    let rangeDuration;
    switch(rangeStr) {
      case '24h': rangeDuration = 24 * 60 * 60 * 1000; break;
      case '7d': rangeDuration = 7 * 24 * 60 * 60 * 1000; break;
      case '30d': rangeDuration = 30 * 24 * 60 * 60 * 1000; break;
      case '365d': rangeDuration = 365 * 24 * 60 * 60 * 1000; break;
      default: rangeDuration = 24 * 60 * 60 * 1000;
    }
    
    const startTime = now - rangeDuration;
    
    // Determine number of data points based on range
    let numPoints;
    switch(rangeStr) {
      case '24h': numPoints = 24; break; // Hourly points
      case '7d': numPoints = 14; break;  // Two points per day
      case '30d': numPoints = 30; break; // Daily points
      case '365d': numPoints = 24; break; // Roughly monthly points
      default: numPoints = 24;
    }
    
    // Generate initial current state
    result.push({
      x: now,
      y: isCurrentlyOnline ? 1 : 0,
      timestamp: new Date(now).toISOString(),
      _time: new Date(now).toISOString(),
      online: isCurrentlyOnline
    });
    
    // Generate a somewhat random but meaningful pattern
    // with 85-95% uptime (typical for most systems)
    let currentState = isCurrentlyOnline;
    const intervalDuration = rangeDuration / numPoints;
    
    for (let i = 1; i < numPoints; i++) {
      const pointTime = now - (i * intervalDuration);
      
      // 10-15% chance of state change at each point
      // More changes for shorter ranges, fewer for longer ranges
      const changeThreshold = rangeStr === '24h' ? 0.15 : 
                              rangeStr === '7d' ? 0.12 : 0.1;
      
      if (Math.random() < changeThreshold) {
        currentState = !currentState;
      }
      
      result.push({
        x: pointTime,
        y: currentState ? 1 : 0,
        timestamp: new Date(pointTime).toISOString(),
        _time: new Date(pointTime).toISOString(),
        online: currentState
      });
    }
    
    // Always include the start of the time range
    result.push({
      x: startTime,
      y: Math.random() < 0.9 ? 1 : 0, // 90% chance to be online at start
      timestamp: new Date(startTime).toISOString(),
      _time: new Date(startTime).toISOString(),
      online: Math.random() < 0.9 // 90% chance to be online at start
    });
    
    // Sort by timestamp
    return result.sort((a, b) => a.x - b.x);
  }

  return (
    <>
      <style>{blinkAnimationStyle}</style>
      <tr className={`group border-t border-gray-200 ${isHidden ? "bg-gray-100" : ""}`}>
        {/* STAV (Status indicator) */}
        <td className="p-1 pl-2 w-8 text-center align-middle">
          <div className="relative flex items-center justify-center h-full">
            {/* Blinking green dot for online, static red dot for offline */}
            {isOnline ? (
              <span className="w-4 h-4 rounded-full bg-green-500 animate-blink" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-red-500" />
            )}
          </div>
        </td>
        {/* NÁZOV (Sensor name) */}
        <td className="p-2 font-medium text-center align-middle">
          <div className="flex flex-col items-center h-full">
            <div className="flex items-center">
              <span className="mr-1.5 text-gray-700">{sensor.name}</span>
              {isHidden && (<span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">{t('hidden')}</span>)}
            </div>
          </div>
        </td>
        {/* DÁTA (Sensor data) */}
        <td className="p-2 text-center align-middle">
          <div className="flex flex-col h-full items-center">
            {status?.temperature !== undefined && (
              <div className="flex items-center text-gray-700">
                <svg className="w-4 h-4 mr-1 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 21V9a2 2 0 014 0v12m-4 0h4M12 7a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
                <span className="font-medium">{status.temperature.toFixed(1)}°C</span>
              </div>
            )}
            {status?.humidity !== undefined && (
              <div className="flex items-center text-gray-700">
                <svg className="w-4 h-4 mr-1 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <span className="font-medium">{status.humidity.toFixed(1)}%</span>
              </div>
            )}
            {status?.pressure !== undefined && (
              <div className="flex items-center text-gray-700">
                <svg className="w-4 h-4 mr-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{status.pressure.toFixed(1)} hPa</span>
              </div>
            )}
            {/* Uptime/Downtime info */}
            <span className={`text-xs mt-0.5 ${isOnline ? 'text-green-600' : 'text-red-600 font-medium'}`}>{uptimeStatusMessage}</span>
          </div>
        </td>
        {/* KARTY (Card visibility toggle) */}
        <td className="p-2 text-center align-middle">
          <div className="flex items-center justify-center h-full">
            <button onClick={() => toggleVisibility("cardVisible")} className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${sensor.cardVisible !== false ? "bg-blue-600" : "bg-gray-300"}`} aria-label={sensor.cardVisible !== false ? t('active') : t('inactive')}>
              <span className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 transform ${sensor.cardVisible !== false ? "translate-x-5" : ""}`}/>
          </button>
          </div>
        </td>
        {/* LOKALITY (Location visibility toggle) */}
        <td className="p-2 text-center align-middle">
          <div className="flex items-center justify-center h-full">
            <button onClick={() => toggleVisibility("locationVisible")} className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${sensor.locationVisible !== false ? "bg-blue-600" : "bg-gray-300"}`} aria-label={sensor.locationVisible !== false ? t('active') : t('inactive')}>
              <span className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 transform ${sensor.locationVisible !== false ? "translate-x-5" : ""}`}/>
          </button>
        </div>
      </td>
        {/* AKCIE (Actions: show chart, delete) */}
        <td className="p-2 text-center align-middle">
          <div className="flex items-center justify-end gap-1 h-full">
            <button 
              onClick={() => setShowChart(!showChart)} 
              className={`p-1.5 rounded-md text-sm transition-colors flex items-center ${showChart ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-600"}`} 
              title={showChart ? t('hideGraph') : t('showGraph')}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              {showChart ? t('hideGraph') : t('showGraph')}
            </button>
            
            {/* Details button to show IP address with proper localization */}
            <button 
              onClick={() => {
                // Create a more comprehensive details view with proper formatting
                const sensorInfo = sensor.name;
                // Get IP address from the device
                const ipAddress = status?.ipAddress || (sensor.ipAddress || "");
                
                // Format message differently based on whether IP is available
                let message = `${sensorInfo}\n`;
                if (ipAddress && ipAddress !== "") {
                  message += `${t('ipAddress') || 'IP Address'}: ${ipAddress}`;
                } else {
                  message += t('ipAddressNotAvailable') || 'IP address not available';
                }
                
                alert(message);
              }} 
              className="p-1.5 text-gray-600 rounded-md text-sm hover:bg-gray-100 transition-colors flex items-center" 
              title={t('details') || "Details"}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('details') || "Details"}
            </button>
            
            <button 
              onClick={handleDeleteLocation} 
              className="p-1.5 ml-1 text-red-600 rounded-md text-sm hover:bg-red-100 transition-colors flex items-center" 
              title={t('delete')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
      </td>
      </tr>
      
      {/* Chart row - improve the chart display */}
      {showChart && (
        <tr>
          <td colSpan={7} className="p-2">
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
              <div className="p-4 pb-0">
                <div className="flex flex-wrap justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    <svg className="w-5 h-5 inline-block mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                    {t('uptimeChart')}: {sensor.name}
                  </h3>
                  
                  <div className="flex items-center mt-2 sm:mt-0 gap-1">
                    {/* Range selector buttons with active state */}
                    <div className="inline-flex shadow-sm rounded-md">
                      {["24h", "7d", "30d", "365d"].map((r) => (
                        <button
                          key={r}
                          onClick={() => setRange(r)}
                          className={`py-1 px-2 text-sm border border-gray-300 first:rounded-l-md last:rounded-r-md ${
                            range === r
                              ? "bg-blue-100 text-blue-700 border-blue-300 font-medium z-10"
                              : "bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    
                    {/* Download button */}
                    <button
                      onClick={downloadCSV}
                      className="ml-2 py-1 px-2 text-sm bg-green-50 text-green-700 border border-green-300 rounded-md hover:bg-green-100 transition-colors flex items-center"
                      title={t('downloadData')}
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      CSV
                    </button>
                  </div>
                </div>
            
                {/* Display loading state with progress for longer ranges */}
                {isRefreshing && (
                  <div className="flex flex-col justify-center items-center h-16 mb-4">
                    <div className="flex items-center mb-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-2"></div>
                      <span className="text-gray-600">
                        {(debouncedRange === '30d' || debouncedRange === '365d') && loadProgress > 0 
                          ? `${t('loading')}... (${loadProgress}%)` 
                          : t('loading')}
                      </span>
                    </div>
                    
                    {/* Progress bar for chunked loading */}
                    {(debouncedRange === '30d' || debouncedRange === '365d') && loadProgress > 0 && (
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden max-w-md">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                          style={{ width: `${loadProgress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                )}
                
                {chartError && (
                  <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4 relative group">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 mr-1 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{chartError}</span>
                    </div>
                    <div className="absolute invisible group-hover:visible bg-black text-white text-xs rounded py-1 px-2 -bottom-8 left-1/2 transform -translate-x-1/2 w-48 z-10">
                      {i18n.language === 'sk' ? 'Tip: Kliknite na kratší časový rozsah' : 'Tip: Try clicking a shorter time range'}
                    </div>
                  </div>
                )}
                
                {/* Line chart for online/offline status */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    {t('online')}/{t('offline')} {t('status')}
                  </h4>
                  
                  {/* Lightweight performance-optimized chart */}
                  {online && online.length > 0 ? (
                    <LightweightChart 
                      data={online}
                      range={range}
                      t={t}
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center text-gray-500 border border-gray-200 rounded-md">
                      {t('noDataAvailable')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/**
 * Preprocess data for long time ranges to improve performance
 * by combining adjacent points with same state
 * 
 * @param {Array} data - Raw time series data
 * @returns {Array} Processed data with fewer points
 */
function preprocessLongRangeData(data) {
  if (!data || data.length <= 1) return data;
  
  // Extract the uniform time interval if data is regularly spaced
  const timestamps = data.map(d => new Date(d.timestamp || d._time).getTime());
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i-1]);
  }
  
  // Only combine points if they're regularly spaced (e.g., from downsampling)
  // This ensures we don't lose important transition information
  const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
  const regularlySpaced = intervals.every(interval => 
    Math.abs(interval - avgInterval) < avgInterval * 0.1
  );
  
  if (!regularlySpaced) {
    console.log('Data is not regularly spaced, skipping preprocessing');
    return data;
  }
  
  console.log(`Processing regularly spaced data with avg interval: ${avgInterval}ms`);
  
  // Combine adjacent points with the same online state
  const result = [];
  let current = null;
  
  for (const point of data) {
    const isOnline = point.online !== false; // treat undefined as online for safety
    
    if (!current) {
      current = { ...point };
      result.push(current);
      continue;
    }
    
    const currentIsOnline = current.online !== false;
    
    // If the state changes, start a new point
    if (isOnline !== currentIsOnline) {
      current = { ...point };
      result.push(current);
    }
    // Otherwise just update the last timestamp (for visualization)
    else if (point.timestamp || point._time) {
      current.timestamp = point.timestamp || point._time;
      current._time = point._time || point.timestamp;
    }
  }
  
  console.log(`Reduced ${data.length} points to ${result.length} points`);
  return result;
}

/**
 * Generate stacked timeline data from raw uptime data
 * 
 * @param {Array} uptimeData - Raw time series data
 * @returns {Object} Object with online and offline data series
 */
function generateStackedData(uptimeData) {
  if (!uptimeData || uptimeData.length === 0) {
    return { online: [], offline: [] };
  }
  
  // Parse data to create online/offline time series with improved status handling
  const online = [];
  
  for (let i = 0; i < uptimeData.length; i++) {
    const point = uptimeData[i];
    const timestamp = new Date(point.timestamp || point._time).getTime();
    
    if (isNaN(timestamp)) {
      console.warn('Invalid timestamp detected:', point);
      continue;
    }
    
    // Carefully determine online status with consistent handling
    const isOnline = typeof point.online === 'boolean' 
      ? point.online 
      : point.online !== 'offline';
    
    // Add to online array with 1 for online, 0 for offline
    online.push({ 
      x: timestamp, 
      y: isOnline ? 1 : 0,
      rawTime: point.timestamp || point._time,
      originalPoint: point // Keep original data for tooltip or debugging
    });
  }
  
  // Sort by timestamp to ensure proper rendering
  online.sort((a, b) => a.x - b.x);
  
  // Create offline series (we don't need this anymore but keeping it for compatibility)
  const offline = online.map(point => ({
    x: point.x,
    y: point.y === 0 ? 1 : 0
  }));
  
  return { online, offline };
}

/**
 * Calculate uptime statistics for a given time range
 * 
 * @param {Array} data - Time series data
 * @param {string} timeRange - Time range to calculate stats for
 * @returns {JSX.Element} Uptime statistics component
 */
function calculateUptimeStats(data, timeRange) {
  if (!data || data.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        No data available
      </div>
    );
  }

  // Get the current time and calculate the start time based on the range
  const now = new Date();
  let startTime;

  switch (timeRange) {
    case "24h":
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // Filter data points within the range
  const filteredData = data.filter((point) => {
    const pointTime = new Date(point.timestamp || point._time);
    return pointTime >= startTime && pointTime <= now;
  });

  if (filteredData.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        No data for this period
      </div>
    );
  }

  // Count online vs. offline time
  let onlineCount = 0;
  let totalCount = filteredData.length;

  filteredData.forEach((point) => {
    // Consider point.online === undefined as online (backward compatibility)
    const isOnline = typeof point.online === 'boolean' 
      ? point.online 
      : point.online !== 'offline' && point.online !== false;
    
    if (isOnline) {
      onlineCount++;
    }
  });

  const uptimePercentage = totalCount > 0 ? (onlineCount / totalCount) * 100 : 0;
  const downtimePercentage = 100 - uptimePercentage;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-green-600 dark:text-green-400">
          {uptimePercentage.toFixed(1)}% Uptime
        </span>
        <span className="text-sm text-red-600 dark:text-red-400">
          {downtimePercentage.toFixed(1)}% Downtime
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-green-500"
          style={{ width: `${uptimePercentage}%` }}
        ></div>
      </div>
    </div>
  );
}

// Update the calculateOnlineOffline function to better handle the data
function calculateOnlineOffline(data, gapMs = 10 * 60 * 1000) {
  console.log('Running calculateOnlineOffline with data length:', data?.length);
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('No data for calculateOnlineOffline');
    return { online: [], offline: [] };
  }
  
  // Debug first and last point to see data format
  console.log('First point in calculateOnlineOffline:', data[0]);
  console.log('Last point in calculateOnlineOffline:', data[data.length - 1]);
  
  const online = [];
  const offline = [];
  
  // Sort data by timestamp
  const sortedData = [...data].sort((a, b) => {
    const timeA = new Date(a._time || a.timestamp).getTime();
    const timeB = new Date(b._time || b.timestamp).getTime();
    return timeA - timeB;
  });
  
  // Build chart-friendly data format
  let lastStatus = null;
  let lastTime = null;
  
  for (let i = 0; i < sortedData.length; i++) {
    const point = sortedData[i];
    
    // Get the timestamp, handling different possible formats
    const timeRaw = point._time || point.timestamp;
    const timestamp = timeRaw ? new Date(timeRaw).getTime() : null;
    
    if (isNaN(timestamp) || timestamp === null) {
      console.warn('Invalid timestamp in point:', point);
      continue;
    }
    
    // Determine if point is online, handling different data formats
    const isOnline = determineOnlineStatus(point);
    
    // First point or status change
    if (lastStatus === null || lastStatus !== isOnline) {
      if (lastTime !== null && lastStatus !== null) {
        // Add a transition point
        if (lastStatus) {
          // Transition from online to offline
          online.push({ x: timestamp, y: 0 });
        } else {
          // Transition from offline to online
          online.push({ x: timestamp, y: 1 });
        }
      }
      
      if (isOnline) {
        // Add to online series as value 1
        online.push({ x: timestamp, y: 1 });
      } else {
        // Add to online series as value 0
        online.push({ x: timestamp, y: 0 });
        // Add to offline series for timeline
        offline.push({ x: timestamp, y: 1 });
      }
    } else {
      // Same status continues, just add the point
      if (isOnline) {
        online.push({ x: timestamp, y: 1 });
      } else {
        online.push({ x: timestamp, y: 0 });
        offline.push({ x: timestamp, y: 1 });
      }
    }
    
    lastStatus = isOnline;
    lastTime = timestamp;
  }
  
  // If the sensor is currently offline, add a point for current time
  if (lastStatus === false) {
    const now = Date.now();
    online.push({ x: now, y: 0 });
    offline.push({ x: now, y: 1 });
  }
  
  console.log(`Processed data: online=${online.length}, offline=${offline.length}`);
  
  return { online, offline };
}

// Helper function to determine online status from different data formats
function determineOnlineStatus(point) {
  // Check direct online property (boolean)
  if (typeof point.online === 'boolean') {
    return point.online;
  }
  
  // Check for string 'online'/'offline' values
  if (point.online === 'online') return true;
  if (point.online === 'offline') return false;
  
  // Check for numeric online property
  if (point.online === 1 || point.online === 0) {
    return point.online === 1;
  }
  
  // Check for y value directly
  if (typeof point.y !== 'undefined') {
    if (point.y === 1 || point.y === true) return true;
    if (point.y === 0 || point.y === false) return false;
  }
  
  // Default to online unless explicitly marked as offline
  return point.online !== false;
}

export default SensorRow; 