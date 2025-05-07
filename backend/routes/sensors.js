// sensors.js - Routes for sensor data
/**
 * @swagger
 * tags:
 *   name: Sensors
 *   description: Sensor data management and retrieval
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Sensor:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Sensor location/name identifier
 *         cardVisible:
 *           type: boolean
 *           description: Whether the sensor is visible in cards view
 *           default: true
 *         locationVisible:
 *           type: boolean
 *           description: Whether the sensor is visible in location view
 *           default: true
 *         defaultCard:
 *           type: boolean
 *           description: Whether this sensor is shown by default
 *           default: false
 *     SensorStatus:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Sensor identifier
 *         lastSeen:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when sensor was last seen
 *         online:
 *           type: boolean
 *           description: Whether the sensor is currently online
 *         uptimeDuration:
 *           type: string
 *           description: Human-readable uptime duration (e.g., "3d 5h")
 *           nullable: true
 *         offlineDuration:
 *           type: string
 *           description: Human-readable offline duration (e.g., "2h 30m")
 *           nullable: true 
 *         startTime:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when sensor was last started
 *           nullable: true
 *     SensorReading:
 *       type: object
 *       properties:
 *         _time:
 *           type: string
 *           format: date-time
 *           description: Timestamp of the reading
 *         _value:
 *           type: number
 *           description: Sensor value (temperature, humidity, pressure, etc.)
 *         _field:
 *           type: string
 *           description: Type of reading (teplota, vlhkost, tlak)
 *         location:
 *           type: string
 *           description: Sensor location/name
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { locationColors } = require('../db.cjs');
const logger = require('../utils/logger');
const { isAuthenticated } = require('../middleware/auth');
const cache = require('../cache.cjs');
const config = require('../config/config');

// Load visibility configuration
let sensorVisibility = {};
if (fs.existsSync(config.VISIBILITY_FILE)) {
  sensorVisibility = JSON.parse(fs.readFileSync(config.VISIBILITY_FILE));
  logger.log("Loaded saved visibility configuration.");
} else {
  logger.log("No saved visibility found on disk.");
}

// Load default cards from settings.json
const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');
let defaultSettings = { defaultCards: [] };
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    defaultSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    logger.log("Loaded settings from settings.json");
  } catch (err) {
    logger.error("Error loading settings.json:", err);
  }
}

/**
 * Saves visibility configuration to disk
 */
function saveVisibility() {
  fs.writeFileSync(config.VISIBILITY_FILE, JSON.stringify(sensorVisibility, null, 2));
}

/**
 * Saves settings to disk
 */
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
}

/**
 * Formats a duration in milliseconds to a human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
  if (!ms || isNaN(ms) || ms < 0) {
    console.warn(`Invalid duration value: ${ms}ms`);
    return "Unknown";
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Build the string based on the most significant unit
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `<1m`;
  }
}

// Helper function to fetch sensor locations
async function fetchSensorLocations() {
  // First check cache
  const cacheKey = 'sensor_locations';
  const cachedLocations = await cache.get(cacheKey);
  
  if (cachedLocations) {
    return cachedLocations;
  }
  
  const query = `import "influxdata/influxdb/schema"
schema.tagValues(
  bucket: "${config.BUCKET}",
  tag: "location",
  predicate: (r) => r._measurement == "bme280"
)`;

  const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${config.INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query,
  });
  if (!response.ok) {
    throw new Error(`Error from InfluxDB: ${response.statusText}`);
  }

  const text = await response.text();
  const sensorLocations = text
    .split("\n")
    .filter(line => line && !line.startsWith("#"))
    .map(line => line.split(",").pop()?.trim())
    .filter(loc => loc && loc !== "_value" && loc !== "test");

  const uniqueLocations = [...new Set(sensorLocations)];
  
  // Store in cache for 5 minutes
  await cache.set(cacheKey, uniqueLocations, 300);
  
  return uniqueLocations;
}

// Helper function to get the last seen timestamp for a sensor
async function getLastSeenFromInflux(location) {
  const query = `from(bucket: "${config.BUCKET}")
    |> range(start: -30d)
    |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}")
    |> last()`;

  const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${config.INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query,
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`Error from InfluxDB: ${response.statusText}\n${msg}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter(line => line && !line.startsWith("#"));
  if (lines.length < 2) return null;

  const headers = lines[0].split(",");
  const timeIndex = headers.findIndex(h => h.trim() === "_time");
  if (timeIndex === -1) return null;

  const lastLine = lines[1].split(",");
  return lastLine[timeIndex];
}

// Helper function to get sensor start time (for uptime calc)
async function getActualStartTimeFromInflux(name) {
  try {
    // First, try to get the most recent data point to ensure sensor is active
    const latestDataQuery = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
        |> filter(fn: (r) => r._field == "teplota")
        |> last()
    `;
    
    const latestResponse = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: latestDataQuery,
    });
    
    if (!latestResponse.ok) {
      return null;
    }
    
    const latestText = await latestResponse.text();
    
    // Simplified query to find the first point after a significant gap
    // Find gaps between data points and identify when the sensor restarted
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -3d)  // Look back 3 days
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
        |> filter(fn: (r) => r._field == "teplota")
        |> sort(columns: ["_time"], desc: false)
        |> elapsed(unit: 1m, timeColumn: "_time", columnName: "gap")
        |> filter(fn: (r) => r.gap > 20.0)  // Significant gap: more than 20 minutes
        |> sort(columns: ["_time"], desc: true)  // Sort most recent first
        |> limit(n: 1)  // Get the most recent restart
    `;

    const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    
    const lines = text.split("\n").filter(line => line && !line.startsWith("#"));
    
    if (lines.length < 2) {
      return null;
    }
    
    // Get the time of the point after the gap (where restart happened)
    const headers = lines[0].split(",");
    const timeIndex = headers.findIndex(h => h.trim() === "_time");
    if (timeIndex === -1) {
      return null;
    }

    const dataLine = lines[1].split(",");
    const startTime = dataLine[timeIndex];
    return startTime;
  } catch (error) {
    return null;
  }
}

/**
 * Parse CSV text to JSON with enhanced online/offline detection
 * @param {string} csvText - CSV text to parse
 * @param {boolean} debug - Enable debug logging
 * @returns {Array} Array of parsed data objects with online status
 */
function parseCSVtoJSON(csvText, debug = false) {
  const lines = csvText.split("\n").filter(ln => ln && !ln.startsWith("#"));
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim());
  const data = [];
  
  // First pass - parse CSV to objects
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (!row.length) continue;
    
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] || "").trim();
    });
    
    // Parse timestamp to ensure proper sorting
    if (obj._time) {
      obj._time_ms = new Date(obj._time).getTime();
    }
    
    data.push(obj);
  }
  
  // Sort data by timestamp to ensure chronological order
  data.sort((a, b) => (a._time_ms || 0) - (b._time_ms || 0));
  
  // Second pass - detect gaps in data (offline periods)
  const OFFLINE_GAP_MS = 10 * 60 * 1000; // 10 minutes
  
  // Add online status to each data point
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    const prev = i > 0 ? data[i-1] : null;
    
    // Default to online unless we detect a gap
    current.online = true;
    
    if (prev && current._time_ms && prev._time_ms) {
      const timeDiff = current._time_ms - prev._time_ms;
      
      // If gap is larger than threshold, mark as gap in data (offline period)
      if (timeDiff > OFFLINE_GAP_MS) {
        if (debug) {
          console.log(`[GAP] Detected ${timeDiff/1000}s gap between ${prev._time} and ${current._time}`);
        }
        // Mark this point as coming after an offline period 
        current.gap_before = timeDiff;
      }
    }
  }
  
  return data;
}

/**
 * @swagger
 * /api/sensors:
 *   get:
 *     summary: Get all sensors
 *     description: Retrieves a list of all available sensors with their visibility settings
 *     tags: [Sensors]
 *     responses:
 *       200:
 *         description: List of sensors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sensor'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get all sensor locations
router.get('/', async (req, res) => {
  try {
    const locations = await fetchSensorLocations();
    const sensorObjects = locations.map(name => {
      const visibility = sensorVisibility[name] || {};
      const isDefaultCard = defaultSettings.defaultCards && 
                          defaultSettings.defaultCards.includes(name);
      
      // Update visibility with defaultCard status from settings
      if (!visibility.defaultCard !== !isDefaultCard) {
        visibility.defaultCard = isDefaultCard;
        sensorVisibility[name] = visibility;
      }
      
      return {
        name,
        cardVisible: typeof visibility.cardVisible === 'boolean' ? visibility.cardVisible : true,
        locationVisible: typeof visibility.locationVisible === 'boolean' ? visibility.locationVisible : true,
        defaultCard: !!visibility.defaultCard
      };
    });
    
    // Save any updates we made
    saveVisibility();
    
    res.json(sensorObjects);
  } catch (err) {
    logger.error("Error loading sensors:", err);
    res.status(500).json({ error: "Error reading from InfluxDB" });
  }
});

/**
 * @swagger
 * /api/sensors/status:
 *   get:
 *     summary: Get status of all sensors
 *     description: Retrieves the online/offline status and uptime information for all sensors
 *     tags: [Sensors]
 *     responses:
 *       200:
 *         description: Status information for all sensors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SensorStatus'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get status of all sensors
router.get('/status', async (req, res) => {
  try {
    const locations = await fetchSensorLocations();
    const now = Date.now();
    
    // Get request parameters
    const showLastReadings = req.query.lastReadings !== 'false'; // Default to showing last readings unless explicitly disabled
    
    // Process each location in parallel
    const results = await Promise.all(locations.map(async (name) => {
      try {
        const latestValues = await getLatestSensorValues(name);
        
        // Online status is based on latest values being recent (last 10 min)
        const lastSeen = latestValues?.timestamp || null;
        const ageMs = lastSeen ? now - new Date(lastSeen).getTime() : Infinity;
        const isOnline = ageMs < 10 * 60 * 1000; // Less than 10 minutes
        
        // Calculate uptime or offline duration based on current status
        let uptimeDuration = null;
        let offlineDuration = null;
        let startTime = null;
        let lastGapTime = null;
        
        // Get the start time when the sensor was last restarted (needed for both online and offline cases)
        startTime = await getActualStartTimeFromInflux(name);
        
        // Check for significant gaps in data (over 10 minutes)
        if (!isOnline) {
          // Try to find the most recent gap over 10 minutes
          const gapInfo = await findRecentDataGap(name);
          if (gapInfo && gapInfo.gapStart) {
            lastGapTime = gapInfo.gapStart;
          }
        }
        
        if (isOnline) {
          // Calculate uptime from startTime to now
          if (startTime) {
            try {
              const startTimeMs = new Date(startTime).getTime();
              if (isNaN(startTimeMs)) {
                uptimeDuration = "Unknown";
              } else {
                const uptimeMs = now - startTimeMs;
                uptimeDuration = formatDuration(uptimeMs);
              }
            } catch (error) {
              uptimeDuration = "Unknown";
            }
          }
        } else {
          // For offline sensors, calculate downtime from the gap time or startTime
          if (lastGapTime) {
            // If we found a significant gap, calculate from that time
            try {
              const gapTimeMs = new Date(lastGapTime).getTime();
              if (isNaN(gapTimeMs)) {
                // Fix: Use a more specific message for clarity
                offlineDuration = "Unknown (Last Gap)";
              } else {
                const offlineMs = now - gapTimeMs;
                offlineDuration = formatDuration(offlineMs);
              }
            } catch (error) {
              // Fix: Log the actual error for debugging
              console.error(`Error calculating offline duration from gap time for ${name}:`, error);
              offlineDuration = "Error (Gap)";
            }
          } else if (startTime) {
            // If no gap found, use startTime
            try {
              const startTimeMs = new Date(startTime).getTime();
              if (isNaN(startTimeMs)) {
                // Fix: Use a more specific message for clarity
                offlineDuration = "Unknown (Start)";
              } else {
                const offlineMs = now - startTimeMs;
                offlineDuration = formatDuration(offlineMs);
              }
            } catch (error) {
              // Fix: Log the actual error for debugging
              console.error(`Error calculating offline duration from start time for ${name}:`, error);
              offlineDuration = "Error (Start)";
            }
          } else if (lastSeen) {
            // Fallback to lastSeen if no other reference point is available
            try {
              const lastSeenMs = new Date(lastSeen).getTime();
              if (isNaN(lastSeenMs)) {
                // Fix: Use a more specific message for clarity
                offlineDuration = "Unknown (Last)";
              } else {
                const offlineMs = now - lastSeenMs;
                offlineDuration = formatDuration(offlineMs);
              }
            } catch (error) {
              // Fix: Log the actual error for debugging
              console.error(`Error calculating offline duration from last seen for ${name}:`, error);
              offlineDuration = "Error (Last)";
            }
          } else {
            // Fix: If we have no reference points at all, provide a clearer message
            console.log(`No time reference found for ${name} to calculate downtime`);
            
            // Try to find the last database write as a fallback
            // Only look for last reading details if enabled
            const lastWriteInfo = showLastReadings ? 
              await findLastDatabaseWrite(name) : 
              await findLastDatabaseWriteWithoutDetails(name); 
            
            if (lastWriteInfo && lastWriteInfo.lastWriteTime) {
              // We found a historical data point - use it to calculate downtime
              console.log(`Found last database write for ${name}: ${lastWriteInfo.lastWriteTime}`);
              
              try {
                const offlineMs = lastWriteInfo.ageMs;
                offlineDuration = formatDuration(offlineMs);
                
                // If showing last readings is enabled and we have field info
                if (showLastReadings && lastWriteInfo.fieldInfo && lastWriteInfo.fieldInfo.field) {
                  let valueInfo = "";
                  
                  // Format value based on field type
                  if (lastWriteInfo.fieldInfo.field === "teplota") {
                    valueInfo = `${parseFloat(lastWriteInfo.fieldInfo.value).toFixed(1)}°C`;
                  } else if (lastWriteInfo.fieldInfo.field === "vlhkost") {
                    valueInfo = `${parseFloat(lastWriteInfo.fieldInfo.value).toFixed(1)}%`;
                  } else if (lastWriteInfo.fieldInfo.field === "tlak") {
                    valueInfo = `${parseFloat(lastWriteInfo.fieldInfo.value).toFixed(1)} hPa`;
                  } else if (lastWriteInfo.fieldInfo.field === "_time" || 
                            lastWriteInfo.fieldInfo.field === "timestamp" ||
                            lastWriteInfo.fieldInfo.field === "_start" ||
                            lastWriteInfo.fieldInfo.field === "_stop") {
                    // Skip timestamp fields - don't include these in the message
                    valueInfo = "";
                  } else {
                    valueInfo = lastWriteInfo.fieldInfo.value;
                  }
                  
                  // Add note with both time and value - only if valueInfo is meaningful
                  if (valueInfo && valueInfo.length > 0) {
                    offlineDuration += ` (last: ${valueInfo})`;
                  } else {
                    // Just add the generic "since last data" note
                    offlineDuration += " (since last data)";
                  }
                } else {
                  // Add a note that this is from the last database write
                  offlineDuration += " (since last data)";
                }
              } catch (error) {
                console.error(`Error calculating downtime from last write for ${name}:`, error);
                offlineDuration = "Error (LastWrite)";
              }
            } else {
              // No reference points at all, check if this is a new sensor
              // Check if this sensor appears to be completely new with no data history
              const sensorCheck = `
                from(bucket: "${config.BUCKET}")
                  |> range(start: -90d)
                  |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
                  |> count()
                  |> limit(n: 1)
              `;
              
              try {
                // Quick check if we've ever had any data from this sensor
                const sensorCheckResponse = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Token ${config.INFLUX_TOKEN}`,
                    'Content-Type': 'application/vnd.flux',
                    'Accept': 'application/csv'
                  },
                  body: sensorCheck,
                });
                
                if (sensorCheckResponse.ok) {
                  const text = await sensorCheckResponse.text();
                  const lines = text.split('\n').filter(line => line && !line.startsWith('#'));
                  
                  if (lines.length >= 2) {
                    // If we found count results
                    const headers = lines[0].split(',');
                    const valueIndex = headers.findIndex(h => h.trim() === '_value');
                    
                    if (valueIndex !== -1) {
                      const dataLine = lines[1].split(',');
                      const count = parseInt(dataLine[valueIndex]) || 0;
                      
                      if (count === 0) {
                        // This is likely a brand new sensor with no history
                        offlineDuration = "No History";
                        console.log(`Sensor ${name} appears to be new with no data history`);
                      } else {
                        // We've had data before, but can't calculate downtime
                        offlineDuration = "No Data";
                      }
                    } else {
                      offlineDuration = "No Data";
                    }
                  } else {
                    offlineDuration = "No Data";
                  }
                } else {
                  // Default if check failed
                  offlineDuration = "No Data";
                }
              } catch (error) {
                console.error(`Error checking history for ${name}:`, error);
                offlineDuration = "No Data";
              }
            }
          }
        }
        
        const result = {
          name,
          lastSeen,
          timestamp: Date.now(), // Add current server timestamp for client-side calculations
          online: isOnline,
          uptimeDuration,
          offlineDuration,
          startTime,
          gapTime: lastGapTime,
          temperature: latestValues?.temperature || null,
          humidity: latestValues?.humidity || null,
          pressure: latestValues?.pressure || null,
          lastSeenFormatted: lastSeen ? formatDateTime(new Date(lastSeen)) : null
        };
        
        return result;
        
      } catch (error) {
        // Fix: Provide more detailed error information to help debugging
        console.error(`Error processing sensor status for ${name}:`, error);
        return {
          name,
          lastSeen: null,
          timestamp: Date.now(),
          online: false,
          offlineDuration: "Error: " + error.message.substring(0, 30), // Truncate to avoid excessively long messages
          error: error.message
        };
      }
    }));
    
    res.json(results);
  } catch (error) {
    console.error("Failed to get sensor status:", error);
    res.status(500).json({ error: 'Failed to get sensor status' });
  }
});

/**
 * Get latest sensor values from InfluxDB
 * @param {string} location - Sensor location
 * @returns {Promise<Object>} - Latest sensor values
 */
async function getLatestSensorValues(location) {
  try {
    // Query influxdb for the latest values (temperature, humidity, pressure)
    // Using a more focused query with better error handling
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${location}")
        |> filter(fn: (r) => r._field == "teplota" or r._field == "tlak" or r._field == "vlhkost")
        |> last()
    `;
    
    const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    
    // Parse the CSV response
    const lines = text.split('\n').filter(line => line && !line.startsWith('#'));
    
    if (lines.length < 2) {
      return null;
    }
    
    // Process the data
    // CSV format has headers in first line and data in subsequent lines
    const headers = lines[0].split(',');
    
    // Find column indexes
    const timeIndex = headers.findIndex(h => h === '_time');
    const fieldIndex = headers.findIndex(h => h === '_field');
    const valueIndex = headers.findIndex(h => h === '_value');
    
    if (timeIndex === -1 || fieldIndex === -1 || valueIndex === -1) {
      return null;
    }
    
    // Process all data lines
    let temperature = null;
    let humidity = null;
    let pressure = null;
    let timestamp = null;
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      
      const values = lines[i].split(',');
      if (values.length <= Math.max(timeIndex, fieldIndex, valueIndex)) continue;
      
      const time = values[timeIndex];
      const field = values[fieldIndex];
      const value = values[valueIndex];
      
      // Update the timestamp from the most recent time
      if (!timestamp || new Date(time) > new Date(timestamp)) {
        timestamp = time;
      }
      
      // Parse the value and assign to the right variable
      const numValue = parseFloat(value);
      if (isNaN(numValue)) continue;
      
      if (field === 'teplota') {
        temperature = numValue;
      } else if (field === 'vlhkost') {
        humidity = numValue;
      } else if (field === 'tlak') {
        pressure = numValue;
      }
    }
    
    const result = { temperature, humidity, pressure, timestamp };
    return result;
  
  } catch (error) {
    return null;
  }
}

/**
 * Format a date and time
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date and time
 */
function formatDateTime(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * @swagger
 * /api/sensors/{name}/visibility:
 *   post:
 *     summary: Update sensor visibility
 *     description: Updates the visibility settings for a specific sensor
 *     tags: [Sensors]
 *     parameters:
 *       - in: path
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: Sensor name/location
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardVisible:
 *                 type: boolean
 *                 description: Whether the sensor should be visible in card view
 *               locationVisible:
 *                 type: boolean
 *                 description: Whether the sensor should be visible in location view
 *               visible:
 *                 type: boolean
 *                 description: Legacy parameter to set both card and location visibility
 *               defaultCard:
 *                 type: boolean
 *                 description: Whether this sensor should be shown by default
 *     responses:
 *       200:
 *         description: Updated sensor visibility settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sensor'
 */
// Update sensor visibility settings
router.post('/:name/visibility', (req, res) => {
  const { name } = req.params;
  const { cardVisible, locationVisible, visible, defaultCard } = req.body;

  const card = typeof cardVisible === 'boolean' ? cardVisible : visible;
  const loc = typeof locationVisible === 'boolean' ? locationVisible : visible;

  if (!sensorVisibility[name]) sensorVisibility[name] = {};
  if (typeof card === 'boolean') sensorVisibility[name].cardVisible = card;
  if (typeof loc === 'boolean') sensorVisibility[name].locationVisible = loc;
  
  // Handle defaultCard property if it was provided
  if (typeof defaultCard === 'boolean') {
    sensorVisibility[name].defaultCard = defaultCard;
    
    // Synchronize with defaultSettings
    if (defaultCard && !defaultSettings.defaultCards.includes(name)) {
      // Add to defaultCards if it's not already there
      defaultSettings.defaultCards.push(name);
      saveSettings();
    } else if (!defaultCard && defaultSettings.defaultCards.includes(name)) {
      // Remove from defaultCards if it's there
      defaultSettings.defaultCards = defaultSettings.defaultCards.filter(card => card !== name);
      saveSettings();
    }
  }

  saveVisibility();

  res.json({
    name,
    cardVisible: sensorVisibility[name].cardVisible,
    locationVisible: sensorVisibility[name].locationVisible,
    defaultCard: sensorVisibility[name].defaultCard
  });
});

/**
 * @swagger
 * /api/sensors/{name}/history:
 *   get:
 *     summary: Get historical data for a sensor
 *     description: Retrieves historical time-series data for a specific sensor
 *     tags: [Sensors]
 *     parameters:
 *       - in: path
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: Sensor name/location
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *         description: Time range (e.g., "24h", "7d", "30d", "365d", "custom")
 *         default: "24h"
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to include (e.g., "teplota,vlhkost,tlak")
 *       - in: query
 *         name: aggregation
 *         schema:
 *           type: boolean
 *         description: Whether to use data aggregation for better performance
 *       - in: query
 *         name: downsample
 *         schema:
 *           type: string
 *         description: Window size for downsampling (e.g., "1h", "6h")
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start time for custom range (ISO format)
 *       - in: query
 *         name: stop
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End time for custom range (ISO format)
 *     responses:
 *       200:
 *         description: Historical sensor data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SensorReading'
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get historical data for a sensor
router.get('/:name/history', async (req, res) => {
  const sensorName = req.params.name;
  const range = req.query.range || "24h";
  const fields = req.query.fields ? req.query.fields.split(',') : ["teplota", "vlhkost", "tlak"];
  const aggregation = req.query.aggregation === 'true';
  const downsample = req.query.downsample;
  const enhanceOffline = req.query.enhanceOffline !== 'false'; // Default to true
  const debug = req.query.debug === 'true'; // Enable debug logging
  
  // Log the request parameters if debug is enabled
  if (debug) {
    console.log(`[HISTORY] Request for ${sensorName} with range ${range}`);
    console.log(`[HISTORY] Fields: ${fields.join(', ')}`);
    console.log(`[HISTORY] Aggregation: ${aggregation}, Downsample: ${downsample}`);
  }
  
  // Pagination parameters (new)
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 0; // 0 means no pagination (backward compatibility)
  
  // Handle custom time ranges with start/stop parameters
  const customTimeRange = req.query.start && req.query.stop;
  const startTime = req.query.start;
  const stopTime = req.query.stop;
  
  // If range is "custom" but no custom timerange parameters are provided, return an error
  if (range === "custom" && !customTimeRange) {
    return res.status(400).json({ 
      error: "Missing date range parameters",
      details: "When using 'custom' range, both 'start' and 'stop' parameters must be provided"
    });
  }
  
  // Check cache first - include downsample and pagination in cache key
  const timeRangeKey = customTimeRange ? `${startTime.substring(0, 10)}_${stopTime.substring(0, 10)}` : range;
  const paginationKey = limit > 0 ? `_p${page}_l${limit}` : '';
  const cacheKey = `history_${sensorName}_${timeRangeKey}_${fields.join('_')}_${aggregation ? downsample || 'agg' : 'raw'}${paginationKey}`;
  const cachedData = await cache.get(cacheKey);
  
  if (cachedData) {
    if (debug) {
      console.log(`[HISTORY] Cache hit for ${cacheKey}`);
    }
    return res.json(cachedData);
  }

  try {
    // Build InfluxDB query with optional downsampling for better performance
    let query;
    let rangeClause;
    
    // Determine range clause based on whether this is a custom time range
    if (customTimeRange) {
      rangeClause = `range(start: ${startTime}, stop: ${stopTime})`;
    } else {
      // Make sure "custom" doesn't get passed directly to InfluxDB
      const influxRange = (range === "custom") ? "24h" : range;

      // Ensure range is properly formatted for InfluxDB
      // For durations: range(start: -7d)
      // For timestamps: range(start: 2022-01-01T00:00:00Z, stop: 2022-01-08T00:00:00Z)
      if (influxRange.match(/^\d+[dhms]$/)) {
        // If it's a valid duration format like 7d, 24h, etc.
        rangeClause = `range(start: -${influxRange})`;
      } else {
        // Default to 24h if not in the expected format
        rangeClause = `range(start: -24h)`;
      }
    }
    
    if (aggregation && downsample) {
      // Determine whether to include empty windows based on the range
      // For very large ranges, avoid empty windows for performance
      const includeEmptyWindows = !customTimeRange || (
        new Date(stopTime).getTime() - new Date(startTime).getTime() < 30 * 24 * 60 * 60 * 1000
      );
      
      // Select appropriate aggregate function
      // For temperature, usually average is best
      const aggregateFunction = 'mean';
      
      // Use window aggregation for larger time ranges
      query = `from(bucket: "${config.BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> aggregateWindow(every: ${downsample}, fn: ${aggregateFunction}, createEmpty: ${includeEmptyWindows ? 'true' : 'false'})
        |> sort(columns: ["_time"])`;
    } else {
      // For large ranges with no downsampling specified, we should add a limit to prevent overwhelming the client
      // Only add a limit for non-aggregated queries on large ranges
      const isLargeRange = customTimeRange ? 
        (new Date(stopTime).getTime() - new Date(startTime).getTime() > 7 * 24 * 60 * 60 * 1000) :
        (range === '30d' || range === '365d' || range === '180d');
      
      // Adjust limit based on range
      let pointLimit = limit > 0 ? limit : 5000; // Use pagination limit if provided, otherwise default
      if (limit === 0 && range === '365d') {
        pointLimit = 10000; // Double the limit for year-long data (if no pagination)
      }
      
      // Standard query for smaller time ranges
      query = `from(bucket: "${config.BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> sort(columns: ["_time"])${isLargeRange || limit > 0 ? `\n        |> limit(n: ${pointLimit})` : ''}`;
      
      // Add offset for pagination if needed
      if (limit > 0 && page > 1) {
        const offset = (page - 1) * limit;
        query += `\n        |> offset(n: ${offset})`;
      }
    }

    if (debug) {
      console.log(`[HISTORY] InfluxDB query:\n${query}`);
    }

    const influxRes = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!influxRes.ok) {
      const errorMsg = await influxRes.text();
      throw new Error(`InfluxDB error: ${influxRes.statusText}\n${errorMsg}`);
    }
    
    const csvText = await influxRes.text();
    if (debug) {
      console.log(`[HISTORY] CSV response first 200 chars: ${csvText.substring(0, 200)}...`);
      console.log(`[HISTORY] CSV response length: ${csvText.length}`);
    }
    
    let jsonData = parseCSVtoJSON(csvText, debug);
    
    if (debug) {
      console.log(`[HISTORY] Parsed ${jsonData.length} data points`);
      if (jsonData.length > 0) {
        console.log(`[HISTORY] First point: ${JSON.stringify(jsonData[0])}`);
        console.log(`[HISTORY] Last point: ${JSON.stringify(jsonData[jsonData.length - 1])}`);
      }
    }
    
    // Further enhance the data with explicit online/offline intervals
    if (enhanceOffline && jsonData.length > 0) {
      const OFFLINE_GAP_MS = 10 * 60 * 1000; // 10 minutes
      const enhancedData = [];
      
      // Process the data to add offline points at gaps
      for (let i = 0; i < jsonData.length; i++) {
        const current = jsonData[i];
        const prev = i > 0 ? jsonData[i-1] : null;
        
        // If there's a gap before this point, add synthetic offline points
        if (current.gap_before && prev) {
          // Calculate the gap start and end times
          const gapStartTime = new Date(prev._time_ms + 1);
          const gapEndTime = new Date(current._time_ms - 1);
          
          if (debug) {
            console.log(`[HISTORY] Adding offline points for gap: ${gapStartTime.toISOString()} - ${gapEndTime.toISOString()}`);
          }
          
          // Add an offline point at the beginning of the gap
          enhancedData.push({
            ...prev,
            _time: gapStartTime.toISOString(),
            _time_ms: gapStartTime.getTime(),
            online: false,
            is_gap: true
          });
          
          // Add an offline point at the end of the gap
          enhancedData.push({
            ...current,
            _time: gapEndTime.toISOString(),
            _time_ms: gapEndTime.getTime(),
            online: false,
            is_gap: true
          });
        }
        
        // Add the current point
        enhancedData.push(current);
      }
      
      // Check if the last data point is old (consider current time as offline)
      const lastPoint = jsonData[jsonData.length - 1];
      const now = Date.now();
      
      if (lastPoint && lastPoint._time_ms && (now - lastPoint._time_ms > OFFLINE_GAP_MS)) {
        const currentTime = new Date(now).toISOString();
        
        if (debug) {
          console.log(`[HISTORY] Adding current time offline point at ${currentTime}`);
        }
        
        // Add a final offline point at current time
        enhancedData.push({
          ...lastPoint,
          _time: currentTime,
          _time_ms: now,
          online: false,
          is_gap: true,
          is_current: true
        });
      }
      
      jsonData = enhancedData;
      
      if (debug) {
        console.log(`[HISTORY] Enhanced to ${jsonData.length} data points with offline markers`);
      }
    }
    
    // Prepare response with pagination metadata if pagination is enabled
    let responseData = jsonData;
    
    if (limit > 0) {
      // For paginated responses, include pagination metadata
      // This is done in a way that won't break existing clients
      // by keeping the data array intact
      const totalCountQuery = `from(bucket: "${config.BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> count()`;
      
      try {
        const countRes = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${config.INFLUX_TOKEN}`,
            'Content-Type': 'application/vnd.flux',
            'Accept': 'application/csv'
          },
          body: totalCountQuery,
        });
        
        if (countRes.ok) {
          const countCsvText = await countRes.text();
          const countData = parseCSVtoJSON(countCsvText, debug);
          const totalCount = countData.length > 0 ? parseInt(countData[0]._value || 0) : 0;
          
          // Create a response object that has data array plus pagination metadata
          responseData = {
            data: jsonData,
            pagination: {
              page,
              limit,
              totalCount,
              totalPages: Math.ceil(totalCount / limit)
            }
          };
          
          if (debug) {
            console.log(`[HISTORY] Pagination: total=${totalCount}, pages=${Math.ceil(totalCount / limit)}`);
          }
        }
      } catch (err) {
        if (debug) {
          console.error(`[HISTORY] Error getting count for pagination: ${err.message}`);
        }
        
        // If count query fails, still return the data without pagination info
        responseData = {
          data: jsonData,
          pagination: {
            page,
            limit,
            totalCount: null,
            totalPages: null
          }
        };
      }
    }
    
    // Optimize cache TTL based on range and data size
    let cacheTTL = 60; // 1 minute default
    
    if (customTimeRange) {
      // For custom ranges, determine TTL based on time span
      const start = new Date(startTime);
      const stop = new Date(stopTime);
      const durationHours = (stop - start) / (1000 * 60 * 60);
      
      if (durationHours > 720) { // > 30 days
        cacheTTL = 3600; // 1 hour
      } else if (durationHours > 168) { // > 7 days
        cacheTTL = 1800; // 30 minutes
      } else if (durationHours > 24) { // > 1 day
        cacheTTL = 300; // 5 minutes
      }
    } else {
      // For predefined ranges
      if (range === "7d") cacheTTL = 300; // 5 minutes
      if (range === "30d" || range === "180d" || range === "365d") cacheTTL = 3600; // 1 hour
    }
    
    await cache.set(cacheKey, responseData, cacheTTL);
    
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: "Error fetching historical data", details: err.message });
  }
});

// Add a new sensor location
router.post('/add-location', async (req, res) => {
  const { location } = req.body;
  
  // Validate location name
  if (!location) {
    return res.status(400).send('Location name is required');
  }
  
  // Sanitize the location name - only allow alphanumeric characters, spaces, and some special chars
  const sanitizedLocation = location.trim().replace(/[^\w\s-]/g, '');
  
  if (sanitizedLocation !== location) {
    logger.warn(`Location name was sanitized from "${location}" to "${sanitizedLocation}"`);
  }
  
  if (sanitizedLocation.length === 0) {
    return res.status(400).send('Invalid location name. Please use alphanumeric characters, spaces, or hyphens.');
  }
  
  try {
    // Check if location already exists
    const sensors = await fetchSensorLocations();
    const existingLocation = sensors.some(s => s === sanitizedLocation || s.split('_')[0] === sanitizedLocation);
    
    if (existingLocation) {
      return res.status(409).send(`Location "${sanitizedLocation}" already exists.`);
    }
    
    const nowInSeconds = Math.floor(Date.now() / 1000);
    
    // Create initial data points for all fields
    const data = [
      `bme280,location=${sanitizedLocation} teplota=0 ${nowInSeconds}`,
      `bme280,location=${sanitizedLocation} vlhkost=0 ${nowInSeconds}`,
      `bme280,location=${sanitizedLocation} tlak=0 ${nowInSeconds}`
    ].join('\n');

    logger.log(`Adding new location "${sanitizedLocation}" with initial data points`);
    
    const response = await fetch(`${config.INFLUX_URL}/api/v2/write?org=${config.ORG}&bucket=${config.BUCKET}&precision=s`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: data,
    });
    
    if (!response.ok) {
      const txt = await response.text();
      logger.error(`Failed to add location "${sanitizedLocation}": ${response.statusText}\n${txt}`);
      throw new Error(`Error adding location: ${response.statusText}\n${txt}`);
    }
    
    // Add to location order if it exists in localStorage
    logger.log(`Location "${sanitizedLocation}" added successfully`);
    res.status(200).json({
      success: true,
      message: `Location "${sanitizedLocation}" has been added successfully.`,
      locationName: sanitizedLocation
    });
  } catch (err) {
    logger.error('Error adding location to InfluxDB:', err);
    res.status(500).json({
      success: false,
      error: 'Error adding location',
      details: err.message
    });
  }
});

// Delete a sensor location
router.post("/delete-location", async (req, res) => {
  const { location } = req.body;
  if (!location) {
    return res.status(400).send("Missing parameter 'location'.");
  }

  try {
    // DELETE body: define time and predicate
    const bodyJson = {
      start: "1970-01-01T00:00:00Z",
      stop: "2100-01-01T00:00:00Z",
      predicate: `_measurement="bme280" AND location="${location}"`
    };

    const deleteUrl = `${config.INFLUX_URL}/api/v2/delete?org=${config.ORG}&bucket=${config.BUCKET}`;
    const influxRes = await fetch(deleteUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.INFLUX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyJson),
    });

    if (!influxRes.ok) {
      const errText = await influxRes.text();
      return res
        .status(500)
        .send(`Failed to delete location: ${influxRes.statusText}\n${errText}`);
    }

    res.status(200).send(`Location '${location}' has been deleted.`);
  } catch (err) {
    logger.error("Error deleting location:", err);
    res.status(500).send("Error deleting location.");
  }
});

/**
 * Get all sensor locations from InfluxDB
 * @returns {Promise<string[]>} - Array of sensor locations
 */
async function getLocationsFromInflux() {
  try {
    return await fetchSensorLocations();
  } catch (error) {
    return [];
  }
}

/**
 * Find the most recent gap in data over 10 minutes
 * @param {string} sensorName - Sensor location/name
 * @returns {Promise<Object|null>} - Gap information or null if no gap found
 */
async function findRecentDataGap(sensorName) {
  try {
    // Query to find gaps in data points
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -6h)  // Look at the last 6 hours of data
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${sensorName}")
        |> filter(fn: (r) => r._field == "teplota")  // Use temperature as a reference
        |> sort(columns: ["_time"], desc: false)     // Sort by time ascending
        |> elapsed(unit: 1m, timeColumn: "_time", columnName: "gap_minutes")
        |> filter(fn: (r) => r.gap_minutes > 10.0)   // Find gaps over 10 minutes
        |> sort(columns: ["_time"], desc: true)      // Most recent first
        |> limit(n: 1)                              // Get only the most recent gap
    `;
    
    const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const lines = text.split('\n').filter(line => line && !line.startsWith('#'));
    
    if (lines.length < 2) {
      return null;
    }
    
    // Parse the response to get gap information
    const headers = lines[0].split(',');
    const timeIndex = headers.findIndex(h => h.trim() === '_time');
    const gapIndex = headers.findIndex(h => h.trim() === 'gap_minutes');
    
    if (timeIndex === -1 || gapIndex === -1) {
      return null;
    }
    
    const dataLine = lines[1].split(',');
    const gapTime = dataLine[timeIndex];
    const gapMinutes = parseFloat(dataLine[gapIndex]);
    
    return {
      gapStart: gapTime,
      gapMinutes: gapMinutes
    };
  } catch (error) {
    return null;
  }
}

/**
 * Find the last database write for a specific sensor location
 * This is useful as a fallback when other time references aren't available
 * @param {string} sensorName - The sensor location/name
 * @returns {Promise<Object|null>} - Last write information or null if not found
 */
async function findLastDatabaseWrite(sensorName) {
  try {
    // Query to find the last data point ever written for this sensor
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -365d)  // Look back up to a year
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${sensorName}")
        |> filter(fn: (r) => r._field == "teplota" or r._field == "vlhkost" or r._field == "tlak")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;
    
    const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const lines = text.split('\n').filter(line => line && !line.startsWith('#'));
    
    if (lines.length < 2) {
      return null;
    }
    
    // Parse the response to get the last write time
    const headers = lines[0].split(',');
    const timeIndex = headers.findIndex(h => h.trim() === '_time');
    
    if (timeIndex === -1) {
      return null;
    }
    
    // Just get the timestamp from the first (most recent) data point
    const dataLine = lines[1].split(',');
    const lastWriteTime = dataLine[timeIndex] ? new Date(dataLine[timeIndex]).getTime() : null;
    
    if (!lastWriteTime) {
      return null;
    }
    
    // Get field name and value for reference
    const fieldIndex = headers.findIndex(h => h.trim() === '_field');
    const valueIndex = headers.findIndex(h => h.trim() === '_value');
    let fieldInfo = {};
    
    if (fieldIndex !== -1 && valueIndex !== -1) {
      fieldInfo = {
        field: dataLine[fieldIndex],
        value: dataLine[valueIndex]
      };
    }
    
    return {
      lastWriteTime: new Date(lastWriteTime).toISOString(),
      ageMs: Date.now() - lastWriteTime,
      fieldInfo
    };
  } catch (error) {
    console.error(`Error finding last database write for ${sensorName}:`, error);
    return null;
  }
}

/**
 * Find the last database write for a specific sensor location
 * This is a simplified version that doesn't include field details
 * @param {string} sensorName - The sensor location/name
 * @returns {Promise<Object|null>} - Last write information or null if not found
 */
async function findLastDatabaseWriteWithoutDetails(sensorName) {
  try {
    // Query to find the last data point ever written for this sensor
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -365d)  // Look back up to a year
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${sensorName}")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;
    
    const response = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const lines = text.split('\n').filter(line => line && !line.startsWith('#'));
    
    if (lines.length < 2) {
      return null;
    }
    
    // Parse the response to get the last write time
    const headers = lines[0].split(',');
    const timeIndex = headers.findIndex(h => h.trim() === '_time');
    
    if (timeIndex === -1) {
      return null;
    }
    
    // Just get the timestamp from the first (most recent) data point
    const dataLine = lines[1].split(',');
    const lastWriteTime = dataLine[timeIndex] ? new Date(dataLine[timeIndex]).getTime() : null;
    
    if (!lastWriteTime) {
      return null;
    }
    
    return {
      lastWriteTime: new Date(lastWriteTime).toISOString(),
      ageMs: Date.now() - lastWriteTime,
      // No field info included
    };
  } catch (error) {
    console.error(`Error finding last database write for ${sensorName}:`, error);
    return null;
  }
}

module.exports = router; 