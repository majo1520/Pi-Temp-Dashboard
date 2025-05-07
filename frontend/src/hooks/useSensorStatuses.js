import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';

/**
 * Custom hook for managing sensor status data
 * 
 * @param {Object} options - Options for the hook
 * @param {boolean} options.showLastReadings - Whether to show last readings in downtime
 * @returns {Object} Sensor status data and functions
 */
export default function useSensorStatuses(options = {}) {
  const { showLastReadings = true } = options;
  const [sensorStatuses, setSensorStatuses] = useState([]);

  // Load statuses from API
  const loadStatuses = useCallback(() => {
    console.log("Loading sensor statuses...");
    return api.getSensorStatuses({ showLastReadings })
      .then(data => {
        if (Array.isArray(data)) {
          console.log("Received sensor status data:", data);
          
          // Check if we have uptime/downtime info
          const hasDurationInfo = data.some(s => 
            s.uptimeDuration || s.offlineDuration || s.startTime
          );
          
          if (!hasDurationInfo) {
            console.warn("No uptime/downtime information found in sensor status data");
          }
          
          setSensorStatuses(data);
          return data;
        } else {
          console.error("Unexpected format for sensor statuses:", data);
          throw new Error("Unexpected status format");
        }
      })
      .catch(err => {
        console.error("Error loading statuses:", err);
        throw err;
      });
  }, []);

  // Get status for a specific sensor
  const getSensorStatus = useCallback((sensorName) => {
    const st = sensorStatuses.find(s => s.name === sensorName) || {};
    const currentTime = Date.now();
    
    // Log the full status object for debugging
    console.log(`[HOOK] Status for ${sensorName}:`, st);
    
    // Determine if sensor is online based on API response
    const isOnline = st.online === true;
    
    // For display in table - directly use API values
    const result = {
      online: isOnline,
      lastSeen: st.lastSeen,
      uptimeDuration: st.uptimeDuration,
      offlineDuration: st.offlineDuration,
      startTime: st.startTime
    };
    
    // Fix: Handle offline status more gracefully by ensuring we always have a valid offlineDuration string
    if (!isOnline && (!st.offlineDuration || st.offlineDuration === "Unknown" || st.offlineDuration === "No Data")) {
      // If we're offline but don't have a valid offline duration, calculate it from lastSeen if available
      if (st.lastSeen) {
        try {
          const lastSeenTime = new Date(st.lastSeen).getTime();
          const offlineSince = currentTime - lastSeenTime;
          // Format the duration with a helper function or human-readable string
          result.offlineDuration = formatOfflineTime(offlineSince);
        } catch (err) {
          console.error(`Error calculating offline duration for ${sensorName}:`, err);
          result.offlineDuration = "Unknown";
        }
      } else if (st.timestamp) {
        // If there's no lastSeen but we have a timestamp from the status request,
        // we can estimate downtime from this as a last resort
        console.log(`No lastSeen for ${sensorName}, using timestamp as reference point`);
        try {
          // For API consistency, we need to calculate a time in the past
          // We'll use an estimate of 1 hour ago as a minimum fallback downtime
          const fallbackDowntimeMs = 60 * 60 * 1000; // 1 hour in ms
          result.offlineDuration = formatOfflineTime(fallbackDowntimeMs);
          console.log(`Calculated fallback offline duration for ${sensorName}: ${result.offlineDuration}`);
        } catch (err) {
          console.error(`Error calculating fallback duration for ${sensorName}:`, err);
          result.offlineDuration = "1h+"; // Default fallback
        }
      } else {
        // If we don't have lastSeen or timestamp, mark it clearly as No Data
        result.offlineDuration = "No Data";
      }
    }
    
    console.log(`[HOOK] Processed status for ${sensorName}:`, result);
    return result;
  }, [sensorStatuses]);

  // Helper function to format offline time in a human-readable format
  const formatOfflineTime = (ms) => {
    if (!ms || isNaN(ms)) return "Unknown";
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `<1m`;
    }
  };

  // Load statuses on mount and periodically
  useEffect(() => {
    loadStatuses();
    const interval = setInterval(loadStatuses, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, [loadStatuses]);

  return {
    sensorStatuses,
    loadStatuses,
    getSensorStatus
  };
}