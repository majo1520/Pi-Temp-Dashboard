/**
 * API service for making requests to the backend
 */

import config from '../config';
import axios from 'axios';
// Define API_BASE_URL as a relative path to ensure it works with the proxy
const API_BASE_URL = config.API_URL;

/**
 * Get all sensors
 * @returns {Promise<Array>} - Array of sensors
 */
export async function getSensors() {
  // Add cache-busting parameter to avoid browser caching
  const cacheBuster = `_=${Date.now()}`;
  const response = await fetch(`${API_BASE_URL}/sensors?${cacheBuster}`);
  if (!response.ok) {
    throw new Error('Failed to fetch sensors');
  }
  return response.json();
}

/**
 * Get sensor history data with improved performance and error handling
 * @param {string} sensorName - Sensor location name
 * @param {string} range - Time range (e.g. "24h", "7d")
 * @param {Object} options - Additional options
 * @param {boolean} options.debug - Enable debug output
 * @param {boolean} options.enhanceOffline - Include synthetic offline points
 * @returns {Promise<Array>} - Array of sensor data points
 */
export async function getSensorHistory(sensorName, range = "24h", options = {}) {
  const { debug = false, enhanceOffline = true } = options;
  
  if (debug) {
    console.log(`Fetching history for ${sensorName} with range ${range}`);
  }
  
  try {
    // Build URL with parameters
    let url = `${API_BASE_URL}/sensors/${sensorName}/history?range=${range}`;
    
    // Add optional parameters
    if (debug) {
      url += '&debug=true';
    }
    
    if (enhanceOffline === false) {
      url += '&enhanceOffline=false';
    }
    
    // Create an AbortController for timeout handling
    const controller = new AbortController();
    // Use a reasonably long timeout for large data requests
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds
    
    // Use more detailed error tracking to help troubleshooting
    const fetchStartTime = Date.now();
    
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      
      clearTimeout(timeoutId);
      
      // Check for HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      // Parse response
      const data = await response.json();
      
      // Log request performance if debug enabled
      if (debug) {
        const fetchTime = Date.now() - fetchStartTime;
        console.log(`History fetch completed in ${fetchTime}ms, received ${Array.isArray(data) ? data.length : 'object'} response`);
      }
      
      return data;
    } catch (fetchErr) {
      // Clear timeout if fetch fails
      clearTimeout(timeoutId);
      
      // Handle abort errors specifically
      if (fetchErr.name === 'AbortError') {
        throw new Error(`Request timeout after ${Math.round((Date.now() - fetchStartTime)/1000)}s when fetching data for ${sensorName}`);
      }
      
      // Re-throw other errors
      throw fetchErr;
    }
  } catch (err) {
    console.error(`Error fetching history for ${sensorName}:`, err);
    throw err;
  }
}

/**
 * Get all sensor locations
 * @returns {Promise<Array>} - Array of location names
 */
export async function getSensorLocations() {
  const response = await fetch(`${API_BASE_URL}/sensors`);
  if (!response.ok) {
    throw new Error('Failed to fetch sensor locations');
  }
  const data = await response.json();
  return data.map(s => s.name);
}

/**
 * Check the user's session status
 * @returns {Promise<Object>} - Session information {loggedIn: boolean, user?: Object}
 */
export async function checkSession() {
  const response = await fetch(`${API_BASE_URL}/session`, { 
    credentials: 'include' 
  });
  
  if (!response.ok) {
    throw new Error('Failed to check session');
  }
  
  return response.json();
}

/**
 * Get historical data for multiple fields and locations
 * @param {Object} options - Query options
 * @param {Array<string>} options.locations - Sensor locations
 * @param {Array<string>} options.fields - Field names (teplota, vlhkost, tlak)
 * @param {Object} options.timeRange - Time range parameters
 * @returns {Promise<Object>} - Structured historical data
 */
export async function getHistoricalData({ locations = [], timeRange = { rangeKey: '24h' }, fields = [] }) {
  if (!locations.length) {
    console.warn('No locations specified for historical data fetch');
    return {};
  }
  
  // Validate custom range parameters
  if (timeRange.rangeKey === 'custom' && (!timeRange.start || !timeRange.end)) {
    console.error('Custom range selected but start/end dates not provided');
    throw new Error('customRangeError');
  }
  
  // Validate that start date is before end date for custom range
  if (timeRange.rangeKey === 'custom' && timeRange.start && timeRange.end) {
    const startDate = new Date(timeRange.start);
    const endDate = new Date(timeRange.end);
    if (startDate >= endDate) {
      console.error('Invalid custom range: start date must be before end date');
      throw new Error('customRangeInvalidDates');
    }
  }
  
  // Custom aggregator function to determine appropriate time window
  function getCustomAggregator(start, stop) {
    const startDate = new Date(start);
    const stopDate = new Date(stop);
    const durationMs = stopDate - startDate;
    
    // Calculate appropriate window based on data duration
    if (durationMs > 365 * 24 * 60 * 60 * 1000) { // > 1 year
      return '12h';
    } else if (durationMs > 30 * 24 * 60 * 60 * 1000) { // > 30 days
      return '6h';
    } else if (durationMs > 7 * 24 * 60 * 60 * 1000) { // > 7 days
      return '1h';
    } else if (durationMs > 24 * 60 * 60 * 1000) { // > 1 day
      return '30m';
    } else if (durationMs > 12 * 60 * 60 * 1000) { // > 12 hours
      return '15m';
    } else if (durationMs > 6 * 60 * 60 * 1000) { // > 6 hours
      return '5m';
    } else if (durationMs > 60 * 60 * 1000) { // > 1 hour
      return '2m';
    } else {
      return '30s';
    }
  }
  
  // Calculate downsampling interval based on range dynamically
  function getDownsampleInterval(rangeKey, customStart, customEnd) {
    // For live data, no downsampling
    if (rangeKey === 'live') return null;
    // For 30d matrix heatmap, always use 1h
    if (rangeKey === '30d') return '1h';
    // For 365d data, use 12h to get proper aggregation
    if (rangeKey === '365d') return '12h';
    // For custom ranges, use the custom aggregator function
    if (rangeKey === 'custom' && customStart && customEnd) {
      return getCustomAggregator(customStart, customEnd);
    }
    
    // For predefined ranges, calculate start and end times
    let start, stop;
    if (rangeKey === '1h') {
      start = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else if (rangeKey === '6h') {
      start = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else if (rangeKey === '12h') {
      start = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else if (rangeKey === '24h') {
      start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else if (rangeKey === '7d') {
      start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else if (rangeKey === '30d') {
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else if (rangeKey === '365d') {
      start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    } else {
      // Default to 24h if unknown range
      start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      stop = new Date().toISOString();
    }
    
    // Use the custom aggregator for predefined ranges too
    return getCustomAggregator(start, stop);
  }
  
  // Build query parameters
  const params = new URLSearchParams();
  
  let downsample = null;
  
  // Handle time range dynamically
  if (timeRange.rangeKey === 'custom' && timeRange.start && timeRange.end) {
    params.set('start', new Date(timeRange.start).toISOString());
    params.set('stop', new Date(timeRange.end).toISOString());
    downsample = getDownsampleInterval(timeRange.rangeKey, timeRange.start, timeRange.end);
  } else if (timeRange.rangeKey && timeRange.rangeKey !== 'live') {
    params.set('range', timeRange.rangeKey);
    downsample = getDownsampleInterval(timeRange.rangeKey);
  } else {
    params.set('range', '24h');
  }
  
  // Add downsampling parameters if needed
  if (downsample) {
    console.log(`Using downsample interval: ${downsample} for range: ${timeRange.rangeKey}`);
    params.set('aggregation', 'true');
    params.set('downsample', downsample);
  }
  
  // Set location and fields
  if (locations.length) {
    params.set('location', locations.join(','));
  }
  
  if (fields.length) {
    params.set('field', fields.join(','));
  } else {
    params.set('field', 'all');
  }
  
  // Format: csv, json, or lp
  params.set('format', 'json');
  
  // Add timestamp to prevent caching
  params.set('t', Date.now());
  
  // For testing - log the complete URL for debugging
  const url = `${API_BASE_URL}/sensors/${locations[0]}/history?${params.toString()}`;
  console.log('Making request to:', url);
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText
    });
    throw new Error(`Failed to fetch historical data: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('API Response size:', data.length, 'records');
  return data;
}

/**
 * Update sensor visibility
 * @param {string} sensorName - Sensor name/location
 * @param {Object} visibility - Visibility settings
 * @param {boolean} visibility.cardVisible - Card visibility
 * @param {boolean} visibility.locationVisible - Location visibility
 * @returns {Promise<Object>} - Updated sensor
 */
export async function updateSensorVisibility(sensorName, visibility) {
  console.log(`API call: updateSensorVisibility for ${sensorName}`, visibility); // Debug log
  
  try {
    const response = await fetch(`${API_BASE_URL}/sensors/${sensorName}/visibility`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(visibility),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Server error: ${response.status}`, errorText);
      throw new Error(`Failed to update sensor visibility: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Visibility update successful:', result); // Debug log
    return result;
  } catch (error) {
    console.error('Error in updateSensorVisibility:', error);
    throw error;
  }
}

/**
 * Get status of all sensors
 * @param {Object} options - Configuration options
 * @param {boolean} options.showLastReadings - Whether to include last readings info in results
 * @returns {Promise<Array>} - Array of sensor status objects
 */
export async function getSensorStatuses(options = {}) {
  // Set default options
  const { showLastReadings = true } = options;
  
  // Add cache busting to avoid getting stale data
  const cacheBuster = `_t=${Date.now()}`;
  let retries = 0;
  const maxRetries = 2;
  
  const attemptFetch = async () => {
    try {
      console.log('[API] Fetching sensor statuses...');
      const controller = new AbortController();
      
      // Build URL with parameters
      let url = `${API_BASE_URL}/sensors/status?${cacheBuster}`;
      
      // Add lastReadings parameter if explicitly set to false
      if (showLastReadings === false) {
        url += `&lastReadings=false`;
        console.log('[API] Disabling last readings in status request');
      }
      
      console.log(`[API] Request URL: ${url}`);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      
      if (!response.ok) {
        console.error(`[API] Error fetching sensor statuses: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch sensor statuses: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      console.log(`[API] Raw response: ${text.substring(0, 200)}...`);
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`[API] JSON parse error:`, e);
        console.error(`[API] Raw text:`, text);
        throw new Error('Failed to parse sensor status response');
      }
      
      console.log(`[API] Received ${data.length} sensor statuses`);
      
      // Validate response
      const hasUptime = data.some(item => item?.uptimeDuration || item?.offlineDuration);
      console.log(`[API] Response has uptime/downtime info: ${hasUptime}`);
      
      // Validate and fix lastSeen timestamps if needed
      const validatedData = data.map(status => {
        if (!status) return null;
        
        // Create a new object with all the fields
        const validatedStatus = { ...status };
        
        // Ensure we have a valid lastSeen timestamp
        if (status.lastSeen) {
          try {
            const parsedDate = new Date(status.lastSeen);
            // If date is invalid or in the future (by more than 1 minute), fix it
            if (isNaN(parsedDate) || parsedDate > new Date(Date.now() + 60000)) {
              console.warn(`[API] Invalid lastSeen timestamp for sensor ${status.name}: ${status.lastSeen}`);
              validatedStatus.lastSeen = null;
            }
          } catch (e) {
            console.error(`[API] Error parsing lastSeen for ${status.name}:`, e);
            validatedStatus.lastSeen = null;
          }
        }
        
        return validatedStatus;
      }).filter(status => status !== null);
      
      return validatedData;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('[API] Request for sensor statuses timed out');
        throw new Error('Request timed out. Please try again.');
      }
      
      console.error('[API] Error in getSensorStatuses:', error);
      throw error;
    }
  };
  
  // Try with retries on failure
  while (retries <= maxRetries) {
    try {
      return await attemptFetch();
    } catch (error) {
      retries++;
      if (retries > maxRetries) {
        throw error;
      }
      console.log(`Retrying getSensorStatuses (attempt ${retries} of ${maxRetries})...`);
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retries * 1000));
    }
  }
}

/**
 * Add a new location/sensor
 * @param {string} locationName - Name of the new location
 * @returns {Promise<Object>} - Response with success status and message
 */
export async function addLocation(locationName) {
  const response = await fetch(`${API_BASE_URL}/sensors/add-location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ location: locationName }),
  });
  
  const data = await (response.headers.get('content-type')?.includes('json') 
    ? response.json() 
    : response.text().then(text => ({ success: response.ok, message: text })));
  
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Failed to add location');
  }
  
  return data;
}

/**
 * Delete a location/sensor
 * @param {string} locationName - Name of the location to delete
 * @returns {Promise<string>} - Success message
 */
export async function deleteLocation(locationName) {
  const response = await fetch(`${API_BASE_URL}/delete-location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ location: locationName }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete location');
  }
  
  return response.text();
}

/**
 * Login to admin panel
 * @param {string} username - Username or email
 * @param {string} password - Admin password
 * @returns {Promise<Object>} - Login result
 */
export async function login(username, password) {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  
  return response.json();
}

/**
 * Logout from admin panel
 * @returns {Promise<void>}
 */
export async function logout() {
  await fetch(`${API_BASE_URL}/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });
}

/**
 * Imports line-protocol data and associates it with a location
 * @param {File} file - The line-protocol file to upload
 * @param {string} location - The location to associate with the data
 * @returns {Promise<string>} - Success message
 */
export const importLineProtocol = (file, location) => {
  const formData = new FormData();
  formData.append("lpfile", file);
  formData.append("location", location);

  return fetch(`${API_BASE_URL}/import/lp`, {
    method: "POST",
    body: formData,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Import error: ${res.status} ${res.statusText}\n${text}`
        );
      }
      return res.text();
    });
};

/**
 * Exports sensor data in the requested format
 * @param {Object} params - Export parameters
 * @param {string} params.field - Field to export (optional)
 * @param {string} params.location - Location to export (optional)
 * @param {string} params.start - Start time (e.g. '-24h' or '0' for all)
 * @param {string} params.stop - End time (usually 'now()')
 * @param {string} params.format - Export format ('csv', 'json', or 'lp')
 * @returns {Promise<Blob>} - The exported data as a Blob
 */
export const exportData = async ({
  field = "",
  location = "",
  start = "-30d",
  stop = "now()",
  format = "csv"
}) => {
  const params = new URLSearchParams({
    field,
    location,
    start,
    stop,
    format,
    t: Date.now(), // Cache-busting parameter
  });

  const fileType = format === "json"
    ? "application/json"
    : format === "lp"
      ? "text/plain"
      : "text/csv";

  const response = await fetch(`${API_BASE_URL}/export?${params}`, {
    headers: {
      Accept: fileType,
    },
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.status} ${response.statusText}`);
  }

  return await response.blob();
};

/**
 * Get all user settings
 * @returns {Promise<Object>} - All user settings
 */
export async function getUserSettings() {
  const response = await fetch(`${API_BASE_URL}/user-settings`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      console.warn('User is not authenticated. Using localStorage for settings.');
      return null;
    }
    throw new Error('Failed to fetch user settings');
  }
  
  return response.json();
}

/**
 * Get a specific user setting
 * @param {string} key - Setting key
 * @returns {Promise<any>} - Setting value
 */
export async function getUserSetting(key) {
  const response = await fetch(`${API_BASE_URL}/user-settings/${key}`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      console.warn('User is not authenticated. Using localStorage for settings.');
      return null;
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch user setting: ${key}`);
  }
  
  const data = await response.json();
  return data[key];
}

/**
 * Update a user setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @returns {Promise<Object>} - Result of the update
 */
export async function updateUserSetting(key, value) {
  try {
    const response = await fetch(`${API_BASE_URL}/user-settings/${key}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.warn('User is not authenticated. Setting will only be saved locally.');
        return null;
      }
      
      // Try to get a proper error message
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      } catch (e) {
        // If we can't parse JSON, use the status text
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      
      throw new Error(`Failed to update user setting: ${key} - ${errorMessage}`);
    }
    
    return response.json();
  } catch (error) {
    // Log the error and rethrow it
    console.error(`Error in updateUserSetting (${key}):`, error);
    throw error;
  }
}

/**
 * Delete a user setting
 * @param {string} key - Setting key
 * @returns {Promise<Object>} - Result of the deletion
 */
export async function deleteUserSetting(key) {
  const response = await fetch(`${API_BASE_URL}/user-settings/${key}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      console.warn('User is not authenticated. Cannot delete setting from server.');
      return null;
    }
    throw new Error(`Failed to delete user setting: ${key}`);
  }
  
  return response.json();
}

/**
 * Get all users (admin only)
 * @returns {Promise<Array>} Array of user objects
 */
export const getUsers = async () => {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch users');
  }
  
  return response.json();
};

/**
 * Create a new user (admin only)
 * @param {Object} userData - User data object with username, password, email, roles
 * @returns {Promise<Object>} Created user object
 */
export const createUser = async (userData) => {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(userData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create user');
  }
  
  return response.json();
};

/**
 * Reset a user's password (admin only)
 * @param {number} userId - The ID of the user whose password to reset
 * @param {string} newPassword - The new password
 * @returns {Promise<Object>} Operation result
 */
export const resetUserPassword = async (userId, newPassword) => {
  try {
    console.log(`Attempting to reset password for user ID: ${userId}`);
    
    const response = await fetch(`${API_BASE_URL}/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ newPassword })
    });
    
    if (!response.ok) {
      let errorMessage = 'Failed to reset password';
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
        console.error('Password reset error response:', errorData);
      } catch (parseError) {
        // If response cannot be parsed as JSON
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
        console.error('Error parsing server response:', parseError);
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('Password reset successful:', result);
    return result;
  } catch (error) {
    console.error('Error in resetUserPassword:', error);
    throw error;
  }
};

/**
 * Update a user (admin only)
 * @param {number} userId - The ID of the user to update
 * @param {object} userData - Data to update (username, email, active, roles)
 * @returns {Promise<Object>} Updated user data
 */
export const updateUser = async (userId, userData) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(userData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update user');
  }
  
  return response.json();
};

/**
 * Delete a user (admin only)
 * @param {number} userId - The ID of the user to delete
 * @returns {Promise<Object>} Operation result
 */
export const deleteUser = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete user');
  }
  
  return response.json();
};

/**
 * Get all unique sensor locations for dropdown selection
 * @returns {Promise<Array<string>>} - Array of location names
 */
export async function getUniqueLocations() {
  const sensors = await getSensors();
  const locations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
  return locations;
}

/**
 * Get Telegram notification settings
 * @returns {Promise<Object>} - Telegram settings
 */
export async function getTelegramSettings() {
  const response = await fetch(`${API_BASE_URL}/notifications/telegram/settings`, {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch Telegram settings');
  }
  return response.json();
}

/**
 * Update Telegram notification settings
 * @param {Object} settings - Telegram settings
 * @param {string} settings.chatId - Telegram chat ID
 * @param {boolean} settings.enabled - Global enabled state for notifications
 * @param {number} settings.notificationFrequency - How often to check and send notifications (in minutes)
 * @param {string} settings.notificationLanguage - Language for notifications ('en' or 'sk')
 * @param {boolean} settings.sendCharts - Whether to include charts in notifications
 * @param {Object} settings.thresholds - Threshold settings by location
 * @returns {Promise<Object>} - Updated settings
 */
export async function updateTelegramSettings(settings) {
  const response = await fetch(`${API_BASE_URL}/notifications/telegram/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(settings),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update Telegram settings: ${error}`);
  }
  
  return response.json();
}

/**
 * Send a test Telegram notification
 * @param {string} chatId - Telegram chat ID to test
 * @returns {Promise<Object>} - Response data
 */
export async function testTelegramNotification(chatId) {
  const response = await fetch(`${API_BASE_URL}/notifications/telegram/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ chatId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send test notification: ${error}`);
  }

  return await response.json();
}

/**
 * Send a Telegram notification when thresholds are exceeded
 * @param {Object} data - Notification data
 * @param {string} data.location - Location name
 * @param {number} data.temperature - Current temperature
 * @param {number} data.humidity - Current humidity
 * @param {number} data.pressure - Current pressure
 * @param {Object} data.thresholds - Threshold values
 * @returns {Promise<Object>} - Response data
 */
export async function sendTelegramNotification(data) {
  const response = await fetch(`${API_BASE_URL}/notifications/telegram/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send notification: ${error}`);
  }

  return await response.json();
}

/**
 * Send a test chart to Telegram
 * 
 * @param {string} chatId - Telegram chat ID
 * @param {string} type - Chart type (temperature, humidity, pressure)
 * @param {string} location - Location name
 * @param {number} timeRangeMinutes - Time range in minutes
 * @returns {Promise<Object>} - API response
 */
export async function sendTestChart(chatId, type, location, timeRangeMinutes = 60) {
  if (!chatId) {
    throw new Error('Chat ID is required');
  }
  
  if (!location) {
    throw new Error('Location is required');
  }
  
  const validTypes = ['temperature', 'humidity', 'pressure'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid chart type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/telegram/chart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatId,
        location,
        type,
        timeRangeMinutes,
        language: 'en' // Default to English
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send chart: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending test chart:', error);
    throw error;
  }
}

/**
 * Send notification about sensor being offline or coming back online
 * @param {Object} data - Notification data with location, status, and lastSeenTime
 * @returns {Promise<Object>} - API response
 */
export async function sendOfflineNotification(data) {
  // Make sure we have the required data
  if (!data.location || data.status === undefined) {
    throw new Error('Missing required parameters (location and status)');
  }
  
  const response = await fetch(`${API_BASE_URL}/notifications/telegram/notify-offline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send offline notification');
  }
  
  return response.json();
}

/**
 * Get system information for health monitoring
 * @returns {Promise} Promise with system information data
 */
export const getSystemInfo = async () => {
  try {
    const response = await axios.get('/api/admin/monitoring/system', {
      withCredentials: true // Include authentication cookies
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Get system health status
 * @returns {Promise} Promise with health check data
 */
export const getHealthStatus = async () => {
  try {
    const response = await axios.get('/api/admin/monitoring/health', {
      withCredentials: true // Include authentication cookies
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Get queue statistics
 * @returns {Promise} Promise with queue statistics data
 */
export const getQueueStats = async () => {
  try {
    const response = await axios.get('/api/admin/monitoring/queues', {
      withCredentials: true // Include authentication cookies
    });
    return response.data;
  } catch (error) {
    console.warn('Queue stats not available:', error.message);
    return null;
  }
};

/**
 * Get cache statistics
 * @returns {Promise} Promise with cache statistics data
 */
export const getCacheStats = async () => {
  try {
    const response = await axios.get('/api/admin/monitoring/cache', {
      withCredentials: true // Include authentication cookies
    });
    return response.data;
  } catch (error) {
    console.warn('Cache stats not available:', error.message);
    return null;
  }
};

/**
 * Delete a sensor
 * @param {string} sensorName - Name of the sensor to delete
 * @returns {Promise} Promise with deletion confirmation
 */
export const deleteSensor = async (sensorName) => {
  try {
    const response = await axios.delete(`/api/sensors/${encodeURIComponent(sensorName)}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Get network statistics
 * @returns {Promise} Promise with network statistics data
 */
export const getNetworkStats = async () => {
  try {
    const response = await axios.get('/api/admin/monitoring/network', {
      withCredentials: true // Include authentication cookies
    });
    return response.data;
  } catch (error) {
    console.warn('Network stats not available:', error.message);
    return null;
  }
};

/**
 * Get disk health information including SMART data and partitions
 * @returns {Promise} Promise with disk health and usage data
 */
export const getDiskHealth = async () => {
  try {
    // First try dedicated endpoint
    try {
      const response = await axios.get('/api/admin/monitoring/disk', {
        withCredentials: true // Include authentication cookies
      });
      return response.data;
    } catch (endpointError) {
      // If endpoint doesn't exist, extract disk data from system info
      console.log('Dedicated disk endpoint not available, using system info...', endpointError);
      const systemInfoResponse = await axios.get('/api/admin/monitoring/system', {
        withCredentials: true // Include authentication cookies
      });
      
      if (systemInfoResponse.data && systemInfoResponse.data.disk) {
        // Return just the disk portion of the system info
        return systemInfoResponse.data.disk;
      }
      throw new Error('No disk information available in system info');
    }
  } catch (error) {
    console.warn('Disk health data not available:', error.message);
    // Return a minimal structure instead of null to avoid UI breakage
    return {
      health: 'warning',
      message: 'Disk health information currently unavailable',
      disks: []
    };
  }
};

/**
 * Get memory health information with detailed allocation and swap usage
 * @returns {Promise} Promise with memory health and allocation data
 */
export const getMemoryHealth = async () => {
  try {
    // First try dedicated endpoint
    try {
      const response = await axios.get('/api/admin/monitoring/memory', {
        withCredentials: true // Include authentication cookies
      });
      return response.data;
    } catch (endpointError) {
      // If endpoint doesn't exist, extract memory data from system info
      console.log('Dedicated memory endpoint not available, using system info...', endpointError);
      const systemInfoResponse = await axios.get('/api/admin/monitoring/system', {
        withCredentials: true // Include authentication cookies
      });
      
      if (systemInfoResponse.data && systemInfoResponse.data.memory) {
        // Return just the memory portion of the system info
        return systemInfoResponse.data.memory;
      }
      throw new Error('No memory information available in system info');
    }
  } catch (error) {
    console.warn('Memory health data not available:', error.message);
    // Return a minimal structure instead of null to avoid UI breakage
    return {
      health: 'warning',
      message: 'Memory health information currently unavailable',
      swap: { total: 0, used: 0 },
      cached: 0,
      available: 0
    };
  }
};