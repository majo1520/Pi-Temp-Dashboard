// sensors.js - Routes for sensor data
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

function saveVisibility() {
  fs.writeFileSync(config.VISIBILITY_FILE, JSON.stringify(sensorVisibility, null, 2));
}

function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
}

function formatDuration(ms) {
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
    |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}" and r["_field"] == "teplota")
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
    // Query for data points in the past 30 days with a more reliable approach
    // Look for the most recent gap > 10 minutes
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -30d)  // Increased from 3d to 30d to track longer uptime periods
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
        |> filter(fn: (r) => r._field == "teplota")
        |> sort(columns: ["_time"], desc: false)
        |> elapsed(unit: 1m, timeColumn: "_time", columnName: "gap")
        |> filter(fn: (r) => r.gap > 10.0)  // Look for gaps > 10 minutes indicating a restart
        |> sort(columns: ["_time"], desc: true)  // Sort by time descending to get most recent restart first
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
      const msg = await response.text();
      throw new Error(`Error from InfluxDB when getting restart time: ${response.statusText}\n${msg}`);
    }

    const text = await response.text();
    const lines = text.split("\n").filter(line => line && !line.startsWith("#"));
    
    if (lines.length < 2) {
      // If no restart found in past 30 days, get the first data point of the most recent continuous series
      // This will find the most recent start time after a gap
      const latestSessionQuery = `
        from(bucket: "${config.BUCKET}")
          |> range(start: -30d)  // Increased from 6h to 30d to find the earliest data point in the continuous series
          |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
          |> filter(fn: (r) => r._field == "teplota")
          |> sort(columns: ["_time"], desc: false)
          |> first()
      `;
      
      const latestResponse = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${config.INFLUX_TOKEN}`,
          'Content-Type': 'application/vnd.flux',
          'Accept': 'application/csv'
        },
        body: latestSessionQuery,
      });
      
      if (!latestResponse.ok) {
        return null;
      }

      const latestText = await latestResponse.text();
      const latestLines = latestText.split("\n").filter(line => line && !line.startsWith("#"));
      
      if (latestLines.length < 2) return null;
      
      const latestHeaders = latestLines[0].split(",");
      const timeIndex = latestHeaders.findIndex(h => h.trim() === "_time");
      if (timeIndex === -1) return null;
      
      const lastLine = latestLines[1].split(",");
      return lastLine[timeIndex];
    }
    
    // Get the time of the point after the gap (where restart happened)
    const headers = lines[0].split(",");
    const timeIndex = headers.findIndex(h => h.trim() === "_time");
    if (timeIndex === -1) return null;

    const dataLine = lines[1].split(",");
    // Get the timestamp after the gap (which is the restart time)
    return dataLine[timeIndex];
  } catch (error) {
    logger.error(`Error getting actual start time for ${name}:`, error);
    return null;
  }
}

// Helper to parse CSV to JSON (used by historical data endpoint)
function parseCSVtoJSON(csvText) {
  const lines = csvText.split("\n").filter(ln => ln && !ln.startsWith("#"));
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (!row.length) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] || "").trim();
    });
    data.push(obj);
  }
  return data;
}

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

// Get status of all sensors
router.get('/status', async (req, res) => {
  try {
    const locations = await fetchSensorLocations();
    const now = Date.now();
    const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes threshold

    const statuses = await Promise.all(
      locations.map(async (name) => {
        // Get the last seen timestamp
        const lastSeen = await getLastSeenFromInflux(name);
        
        // Calculate if the sensor is online based on the 10-minute threshold
        const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
        const timeSinceLastSeen = lastSeen ? now - lastSeenTime : null;
        const isOnline = lastSeen && timeSinceLastSeen < OFFLINE_THRESHOLD;
        
        // Calculate uptime or offline duration based on current status
        let uptimeDuration = null;
        let offlineDuration = null;
        let startTime = null;
        
        if (isOnline) {
          // Get the start time when the sensor was last restarted
          startTime = await getActualStartTimeFromInflux(name);
          if (startTime) {
            const startTimeMs = new Date(startTime).getTime();
            const uptimeMs = now - startTimeMs;
            uptimeDuration = formatDuration(uptimeMs);
          } else {
            uptimeDuration = "Unknown";
          }
        } else if (lastSeen) {
          // For offline duration, calculate time since last seen
          offlineDuration = formatDuration(timeSinceLastSeen);
        }

        return {
          name,
          lastSeen,
          online: isOnline,
          uptimeDuration,
          offlineDuration,
          timeSinceLastSeen,
          startTime
        };
      })
    );
    res.json(statuses);
  } catch (err) {
    logger.error("Error getting statuses:", err);
    res.status(500).json({ error: "Error getting statuses" });
  }
});

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

// Get historical data for a sensor
router.get('/:name/history', async (req, res) => {
  const sensorName = req.params.name;
  const range = req.query.range || "24h";
  const fields = req.query.fields ? req.query.fields.split(',') : ["teplota", "vlhkost", "tlak"];
  const aggregation = req.query.aggregation === 'true';
  const downsample = req.query.downsample;
  
  // Handle custom time ranges with start/stop parameters
  const customTimeRange = req.query.start && req.query.stop;
  const startTime = req.query.start;
  const stopTime = req.query.stop;
  
  logger.log('Historical data request:', {
    sensorName,
    range,
    fields,
    aggregation,
    downsample,
    customTimeRange,
    startTime,
    stopTime,
    query: req.query
  });
  
  // If range is "custom" but no custom timerange parameters are provided, return an error
  if (range === "custom" && !customTimeRange) {
    return res.status(400).json({ 
      error: "Missing date range parameters",
      details: "When using 'custom' range, both 'start' and 'stop' parameters must be provided"
    });
  }
  
  // Check cache first - include downsample in cache key if present
  const timeRangeKey = customTimeRange ? `${startTime.substring(0, 10)}_${stopTime.substring(0, 10)}` : range;
  const cacheKey = `history_${sensorName}_${timeRangeKey}_${fields.join('_')}_${aggregation ? downsample || 'agg' : 'raw'}`;
  const cachedData = await cache.get(cacheKey);
  
  if (cachedData) {
    logger.log(`Cache hit for ${cacheKey}`);
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
        logger.warn(`Invalid range format: ${influxRange}, defaulting to 24h`);
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
      
      logger.log(`Using downsampled query with aggregation window: ${downsample}, createEmpty: ${includeEmptyWindows}, function: ${aggregateFunction}`);
    } else {
      // For large ranges with no downsampling specified, we should add a limit to prevent overwhelming the client
      // Only add a limit for non-aggregated queries on large ranges
      const isLargeRange = customTimeRange ? 
        (new Date(stopTime).getTime() - new Date(startTime).getTime() > 7 * 24 * 60 * 60 * 1000) :
        (range === '30d' || range === '365d' || range === '180d');
      
      // Adjust limit based on range
      let pointLimit = 5000; // Default limit for large ranges
      if (range === '365d') {
        pointLimit = 10000; // Double the limit for year-long data
      }
      
      // Standard query for smaller time ranges
      query = `from(bucket: "${config.BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> sort(columns: ["_time"])${isLargeRange ? `\n        |> limit(n: ${pointLimit})` : ''}`;
      
      logger.log(`Using standard query ${isLargeRange ? `with limit (${pointLimit} points)` : 'without downsampling'}`);
    }

    logger.log('Executing InfluxDB query:', query);
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
      logger.error('InfluxDB query error:', errorMsg);
      throw new Error(`InfluxDB error: ${influxRes.statusText}\n${errorMsg}`);
    }
    
    const csvText = await influxRes.text();
    logger.log('InfluxDB response received, parsing CSV...');
    const jsonData = parseCSVtoJSON(csvText);
    logger.log('Parsed data:', {
      recordCount: jsonData.length,
      firstRecord: jsonData.length > 0 ? jsonData[0] : null,
      lastRecord: jsonData.length > 0 ? jsonData[jsonData.length - 1] : null
    });
    
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
    
    logger.log(`Setting cache TTL: ${cacheTTL} seconds for ${jsonData.length} records`);
    await cache.set(cacheKey, jsonData, cacheTTL);
    
    res.json(jsonData);
  } catch (err) {
    logger.error("Error fetching historical data:", err);
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

module.exports = router; 