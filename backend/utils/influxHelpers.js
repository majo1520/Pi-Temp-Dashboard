/**
 * Shared InfluxDB helper functions
 * This file contains utilities for querying InfluxDB, used by both REST and GraphQL APIs
 */
const path = require('path');
const fs = require('fs');
const cache = require('../cache.cjs');
const config = require('../config/config');
const logger = require('./logger');

/**
 * Fetches all sensor locations from InfluxDB
 * @returns {Promise<Array<string>>} Array of sensor location names
 */
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

/**
 * Gets the last time data was received from a sensor location
 * @param {string} location - The sensor location to query
 * @returns {Promise<Date|null>} - The timestamp of the last reading or null
 */
async function getLastSeenFromInflux(location) {
  try {
    console.log(`[DEBUG] Getting last seen for location: ${location}`);
    
    // First try to look for the startTime field specifically which is most reliable
    const startTimeQuery = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${location}")
        |> filter(fn: (r) => r._field == "startTime")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n:1)
    `;
    
    const startTimeResponse = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: startTimeQuery,
    });
    
    if (startTimeResponse.ok) {
      const startTimeText = await startTimeResponse.text();
      console.log(`[DEBUG] startTime query result: ${startTimeText.slice(0, 200)}`);
      
      // Check if we got a valid result
      if (startTimeText.includes('_value') && !startTimeText.includes('error')) {
        console.log('[DEBUG] Found startTime field');
        return new Date(); // If we found the startTime field, the sensor is definitely online
      }
    }
    
    // If no startTime field, try the best fallback - check any data point
    const fallbackQuery = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${location}")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n:1)
    `;
    
    const fallbackResponse = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: fallbackQuery,
    });
    
    if (!fallbackResponse.ok) {
      console.error(`Error from InfluxDB: ${fallbackResponse.statusText}`);
      return null;
    }
    
    const text = await fallbackResponse.text();
    console.log(`[DEBUG] fallback query result: ${text.slice(0, 200)}`);
    
    const rows = text.split('\n').filter(line => line.trim() !== '' && !line.startsWith('#'));
    if (rows.length < 2) {
      console.log(`[DEBUG] No data found for ${location}`);
      return null;
    }
    
    // Extract the timestamp from the response
    const headers = rows[0].split(',');
    const values = rows[1].split(',');
    const timeIndex = headers.findIndex(header => header === '_time');
    
    if (timeIndex === -1) {
      console.log(`[DEBUG] No _time column found in response`);
      return null;
    }
    
    const timestamp = values[timeIndex];
    console.log(`[DEBUG] Last seen timestamp for ${location}: ${timestamp}`);
    return new Date(timestamp);
  } catch (error) {
    console.error(`Error getting last seen for ${location}:`, error);
    return null;
  }
}

/**
 * Gets the start time of a sensor (for uptime calculation)
 * @param {string} name - The sensor location name
 * @returns {Promise<string|null>} ISO timestamp when the sensor was last started, or null
 */
async function getActualStartTimeFromInflux(name) {
  try {
    // First, try to get the startTime field which the sensors now publish directly
    const startTimeQuery = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
        |> filter(fn: (r) => r._field == "startTime" or r["startTime"] != "")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;

    const startTimeResponse = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: startTimeQuery,
    });
    
    if (startTimeResponse.ok) {
      const startTimeText = await startTimeResponse.text();
      const startTimeLines = startTimeText.split("\n").filter(line => line && !line.startsWith("#"));
      
      if (startTimeLines.length >= 2) {
        const headers = startTimeLines[0].split(",");
        // Try to find startTime in various possible column locations
        const valueIndex = headers.findIndex(h => h.trim() === "_value");
        const startTimeFieldIndex = headers.findIndex(h => h.trim() === "startTime");
        
        if (valueIndex !== -1 || startTimeFieldIndex !== -1) {
          const dataLine = startTimeLines[1].split(",");
          // First check _value column (if startTime was stored as a field)
          if (valueIndex !== -1 && dataLine[valueIndex]?.trim()) {
            let startTime = dataLine[valueIndex].trim();
            // Check if startTime is a Unix timestamp (integer)
            if (!isNaN(parseInt(startTime)) && parseInt(startTime).toString() === startTime.toString()) {
              // Convert Unix timestamp to ISO string
              console.log(`[DEBUG] Found startTime as Unix timestamp: ${startTime} for ${name}`);
              const date = new Date(parseInt(startTime) * 1000); // Convert to milliseconds
              startTime = date.toISOString();
              console.log(`[DEBUG] Converted to ISO: ${startTime} for ${name}`);
            }
            return startTime;
          }
          // Then check startTime column (if startTime was stored as a tag)
          else if (startTimeFieldIndex !== -1 && dataLine[startTimeFieldIndex]?.trim()) {
            let startTime = dataLine[startTimeFieldIndex].trim();
            // Check if startTime is a Unix timestamp (integer)
            if (!isNaN(parseInt(startTime)) && parseInt(startTime).toString() === startTime.toString()) {
              // Convert Unix timestamp to ISO string
              console.log(`[DEBUG] Found startTime in tag as Unix timestamp: ${startTime} for ${name}`);
              const date = new Date(parseInt(startTime) * 1000); // Convert to milliseconds
              startTime = date.toISOString();
              console.log(`[DEBUG] Converted to ISO: ${startTime} for ${name}`);
            }
            return startTime;
          }
        }
      }
    }
    
    console.log(`[DEBUG] No explicit startTime field found for ${name}, falling back to gap detection`);
    
    // If no startTime field found, fall back to the previous gap detection method
    // Query for data points in the past 30 days with a more reliable approach
    // Look for the most recent gap > 10 minutes
    const query = `
      from(bucket: "${config.BUCKET}")
        |> range(start: -30d)  // Increased from 3d to 30d to track longer uptime periods
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
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
      const startTime = lastLine[timeIndex];
      console.log(`[DEBUG] Found start time from first data point: ${startTime} for ${name}`);
      return startTime;
    }
    
    // Get the time of the point after the gap (where restart happened)
    const headers = lines[0].split(",");
    const timeIndex = headers.findIndex(h => h.trim() === "_time");
    if (timeIndex === -1) return null;

    const dataLine = lines[1].split(",");
    // Get the timestamp after the gap (which is the restart time)
    const startTime = dataLine[timeIndex];
    console.log(`[DEBUG] Found start time from gap detection: ${startTime} for ${name}`);
    return startTime;
  } catch (error) {
    logger.error(`Error getting actual start time for ${name}:`, error);
    return null;
  }
}

/**
 * Parses CSV data from InfluxDB to JSON format
 * @param {string} csvText - CSV text to parse
 * @returns {Array} Array of parsed data objects
 */
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

/**
 * Formats a duration in milliseconds to a human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
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

module.exports = {
  fetchSensorLocations,
  getLastSeenFromInflux,
  getActualStartTimeFromInflux,
  parseCSVtoJSON,
  formatDuration
}; 