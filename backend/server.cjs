// server.cjs
const path = require('path');
const dotenv = require('dotenv');
// Load .env file from backend directory
dotenv.config({ path: path.join(__dirname, '.env.production') });

const express = require('express');
const session = require('express-session');
// Using native Node.js fetch instead of node-fetch package
// const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const fs = require('fs');
const archiver = require('archiver');
const stream = require('stream');
const multer = require('multer');
// Security imports
const helmet = require('helmet');
const csrf = require('csurf');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const xss = require('xss');

// Import the database module
const { users, locationColors, userSettings, closeDatabase, resetUserPassword } = require('./db.cjs');

// Import cache and queue modules
const cache = require('./cache.cjs');
const { createQueue } = require('./queue.cjs');

// Initialize async components
let exportQueue = null;

async function initializeAsyncComponents() {
  try {
    // Create an export queue for processing data exports asynchronously
    exportQueue = await createQueue('export-queue', {
      removeOnComplete: true,
      removeOnFail: 100
    });
    
    if (exportQueue) {
      // Register processor function
      exportQueue.registerProcessor && exportQueue.registerProcessor(async (jobData) => {
        console.log(`Processing export job: ${jobData.type}`);
        // Perform the export operation here
        const { type, locations, range, filename } = jobData;
        
        // Mock export process (this would be your actual export logic)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true, filename };
      });
    }
  } catch (error) {
    console.error('Error initializing async components:', error);
  }
}

// Call the initialize function
initializeAsyncComponents();

const app = express();

// ================== ENV PREMENNÉ ==================
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'testtoken';
const ORG = process.env.ORG || 'testorg';
const BUCKET = process.env.BUCKET || 'testbucket';
const VISIBILITY_FILE = path.join(__dirname, 'visibility.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_insecure_secret';
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 3600000; // 1 hour default
const ENABLE_RATE_LIMITING = process.env.ENABLE_RATE_LIMITING === 'true';
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW) || 15;
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ? 
  process.env.CORS_ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:5173', 'http://192.168.155.206:5000', 'http://192.168.155.206'];

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS with proper configuration - must be before Helmet
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in whitelist or is an IP address in your network
    if (CORS_ALLOWED_ORIGINS.indexOf(origin) !== -1 || 
        /^http:\/\/192\.168\.155\./.test(origin) || 
        /^http:\/\/localhost/.test(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Security middleware
// Apply Helmet for secure HTTP headers but with relaxed settings for development
app.use(helmet({
  contentSecurityPolicy: false,  // Disable CSP in development
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  xssFilter: true,
  hsts: false  // Disable HSTS in development
}));

// Enable Gzip compression
app.use(compression());

// Setup session with secure settings
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to false for HTTP development
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax'  // Changed from 'strict' to 'lax' for better compatibility
  }
}));

// Rate limiting for API routes
if (ENABLE_RATE_LIMITING) {
  const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW * 60 * 1000, // minutes to milliseconds
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', apiLimiter);
}

// CSRF Protection for state-changing endpoints
const csrfProtection = csrf({ cookie: false }); // Using session for CSRF tokens

// Validate and sanitize input function
function sanitizeInput(input) {
  if (typeof input === 'string') {
    return xss(input.trim());
  }
  return input;
}

// Input validation middleware
function validateInput(req, res, next) {
  // Sanitize body parameters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      req.body[key] = sanitizeInput(req.body[key]);
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      req.query[key] = sanitizeInput(req.query[key]);
    });
  }
  
  next();
}

// Apply input validation to all routes
app.use(validateInput);

// multer – pre /api/import-lp (uchová súbor v RAM)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB size limit
    files: 1 // only 1 file allowed
  },
  fileFilter: (req, file, cb) => {
    // Only allow text files
    if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only text files are allowed'), false);
    }
  }
});

// ************************************************************
// *********************** IMPORT LP **************************
// ************************************************************
app.post("/api/import-lp", upload.single("lpfile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("Chýba súbor (lpfile).");
    }
    const { location } = req.body;
    if (!location) {
      return res.status(400).send("Chýba parameter 'location'.");
    }

    let lpData = req.file.buffer.toString("utf-8").trim();
    if (!lpData) {
      return res.status(400).send("Súbor s line-protocol je prázdny.");
    }

    // Doplníme alebo prepíšeme location=...
    const lines = lpData.split("\n");
    const newLines = lines.map((line) => {
      if (!line || line.startsWith("#")) return line;
      const hasLoc = /location=[^, ]*/.test(line);
      if (hasLoc) {
        // bme280,location=XYZ ...
        return line.replace(/location=[^, ]*/, `location=${location}`);
      } else {
        // bme280,tag=val => bme280,location=XYZ,tag=val
        const firstComma = line.indexOf(",");
        if (firstComma >= 0) {
          const prefix = line.slice(0, firstComma);
          const suffix = line.slice(firstComma);
          return `${prefix},location=${location}${suffix}`;
        } else {
          // bme280 field=xx
          const firstSpace = line.indexOf(" ");
          if (firstSpace === -1) return line;
          const measurement = line.slice(0, firstSpace);
          const rest = line.slice(firstSpace);
          return `${measurement},location=${location}${rest}`;
        }
      }
    });

    const finalLpData = newLines.join("\n");

    // Zapíšeme do Influxu
    const influxWriteUrl = `${INFLUX_URL}/api/v2/write?org=${ORG}&bucket=${BUCKET}&precision=ns`;
    const influxRes = await fetch(influxWriteUrl, {
      method: "POST",
      headers: {
        "Authorization": `Token ${INFLUX_TOKEN}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: finalLpData,
    });

    if (!influxRes.ok) {
      const errText = await influxRes.text();
      return res.status(500).send(
        `Chyba pri zápise do Influxu: ${influxRes.statusText}\n${errText}`
      );
    }

    return res.status(200).send("Import line-protocol prebehol úspešne.");
  } catch (err) {
    console.error("Chyba pri importe line-protocol:", err);
    return res.status(500).send("Chyba pri importe line-protocol.");
  }
});

// **************************** VISIBILITY *******************************
let sensorVisibility = {};
if (fs.existsSync(VISIBILITY_FILE)) {
  sensorVisibility = JSON.parse(fs.readFileSync(VISIBILITY_FILE));
  console.log("Načítaná uložená visibility konfigurácia.");
} else {
  console.log("Žiadne uložené visibility na disku.");
}

// Load default cards from settings.json
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
let defaultSettings = { defaultCards: [] };
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    defaultSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    console.log("Načítané nastavenia zo settings.json");
  } catch (err) {
    console.error("Chyba pri načítaní settings.json:", err);
  }
}

function saveVisibility() {
  fs.writeFileSync(VISIBILITY_FILE, JSON.stringify(sensorVisibility, null, 2));
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

// ***************** FUNKCIE PRE INFLUX FETCHING ***********************
async function fetchSensorLocations() {
  // First check cache
  const cacheKey = 'sensor_locations';
  const cachedLocations = await cache.get(cacheKey);
  
  if (cachedLocations) {
    return cachedLocations;
  }
  
  const query = `import "influxdata/influxdb/schema"
schema.tagValues(
  bucket: "${BUCKET}",
  tag: "location",
  predicate: (r) => r._measurement == "bme280"
)`;

  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query,
  });
  if (!response.ok) {
    throw new Error(`Chyba z InfluxDB: ${response.statusText}`);
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

async function getLastSeenFromInflux(location) {
  const query = `from(bucket: "${BUCKET}")
    |> range(start: -30d)
    |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}" and r["_field"] == "teplota")
    |> last()`;

  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query,
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`Chyba z InfluxDB: ${response.statusText}\n${msg}`);
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

async function getLastStartTimeFromInflux(location) {
  const query = `from(bucket: "${BUCKET}")
    |> range(start: -30d)
    |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}" and r["_field"] == "startTime")
    |> last()`;

  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query,
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`Chyba z InfluxDB pri načítaní starttime: ${response.statusText}\n${msg}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter(line => line && !line.startsWith("#"));
  if (lines.length < 2) return null;

  const headers = lines[0].split(",");
  const valueIndex = headers.findIndex(h => h.trim() === "_value");
  if (valueIndex === -1) return null;

  const lastLine = lines[1].split(",");
  const value = lastLine[valueIndex];
  const parsed = parseInt(value);
  if (isNaN(parsed)) return null;

  return new Date(parsed * 1000).toISOString();
}

// Function to get actual uptime by finding when the sensor was continuously online
async function getActualStartTimeFromInflux(name) {
  try {
    // Query for data points in the past 3 days with a more reliable approach
    // Look for the most recent gap > 10 minutes
    const query = `
      from(bucket: "${BUCKET}")
        |> range(start: -3d)  // Reduce from 30 days to 3 days for more reliable recent restart detection
        |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
        |> filter(fn: (r) => r._field == "teplota")
        |> sort(columns: ["_time"], desc: false)
        |> elapsed(unit: 1m, timeColumn: "_time", columnName: "gap")
        |> filter(fn: (r) => r.gap > 10.0)  // Look for gaps > 10 minutes indicating a restart
        |> sort(columns: ["_time"], desc: true)  // Sort by time descending to get most recent restart first
        |> limit(n: 1)
    `;

    const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!response.ok) {
      const msg = await response.text();
      throw new Error(`Chyba z InfluxDB pri načítaní restart time: ${response.statusText}\n${msg}`);
    }

    const text = await response.text();
    const lines = text.split("\n").filter(line => line && !line.startsWith("#"));
    
    if (lines.length < 2) {
      // If no restart found in past 3 days, get the first data point of the most recent continuous series
      // This will find the most recent start time after a gap
      const latestSessionQuery = `
        from(bucket: "${BUCKET}")
          |> range(start: -6h)  // Look at last 6 hours for a more accurate recent session
          |> filter(fn: (r) => r._measurement == "bme280" and r.location == "${name}")
          |> filter(fn: (r) => r._field == "teplota")
          |> sort(columns: ["_time"], desc: false)
          |> first()
      `;
      
      const latestResponse = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${INFLUX_TOKEN}`,
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
    console.error(`Error getting actual start time for ${name}:`, error);
    return null;
  }
}

// **************** PRIDANIE NOVEJ LOKÁCIE ****************
app.use(express.json());
async function addLocationToInflux(locationName) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const data = `bme280,location=${locationName} teplota=0 ${nowInSeconds}`;

  const response = await fetch(`${INFLUX_URL}/api/v2/write?org=${ORG}&bucket=${BUCKET}&precision=s`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: data,
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Chyba pri pridávaní lokácie: ${response.statusText}\n${txt}`);
  }
}

app.post('/api/add-location', async (req, res) => {
  const { location } = req.body;
  if (!location) {
    return res.status(400).send('Názov lokácie je povinný');
  }
  try {
    await addLocationToInflux(location);
    res.status(200).send('Lokácia bola pridaná.');
  } catch (err) {
    console.error('Chyba pri pridávaní lokácie do InfluxDB:', err);
    res.status(500).send('Chyba pri pridávaní lokácie');
  }
});

// **************** HISTORICKÉ DÁTA (JSON) ****************
app.get('/api/sensors/:name/history', async (req, res) => {
  const sensorName = req.params.name;
  const range = req.query.range || "24h";
  const fields = req.query.fields ? req.query.fields.split(',') : ["teplota", "vlhkost", "tlak"];
  const aggregation = req.query.aggregation === 'true';
  const downsample = req.query.downsample;
  
  // Handle custom time ranges with start/stop parameters
  const customTimeRange = req.query.start && req.query.stop;
  const startTime = req.query.start;
  const stopTime = req.query.stop;
  
  console.log('Historical data request:', {
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
    console.log(`Cache hit for ${cacheKey}`);
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
      rangeClause = `range(start: -${influxRange})`;
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
      query = `from(bucket: "${BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> aggregateWindow(every: ${downsample}, fn: ${aggregateFunction}, createEmpty: ${includeEmptyWindows ? 'true' : 'false'})
        |> sort(columns: ["_time"])`;
      
      console.log(`Using downsampled query with aggregation window: ${downsample}, createEmpty: ${includeEmptyWindows}, function: ${aggregateFunction}`);
    } else {
      // For large ranges with no downsampling specified, we should add a limit to prevent overwhelming the client
      // Only add a limit for non-aggregated queries on large ranges
      const isLargeRange = customTimeRange ? 
        (new Date(stopTime).getTime() - new Date(startTime).getTime() > 7 * 24 * 60 * 60 * 1000) :
        (range === '30d' || range === '365d');
      
      // Standard query for smaller time ranges
      query = `from(bucket: "${BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> sort(columns: ["_time"])${isLargeRange ? '\n        |> limit(n: 5000)' : ''}`;
      
      console.log(`Using standard query ${isLargeRange ? 'with limit' : 'without downsampling'}`);
    }

    console.log('Executing InfluxDB query:', query);
    const influxRes = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${INFLUX_TOKEN}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      },
      body: query,
    });
    
    if (!influxRes.ok) {
      const errorMsg = await influxRes.text();
      console.error('InfluxDB query error:', errorMsg);
      throw new Error(`InfluxDB error: ${influxRes.statusText}\n${errorMsg}`);
    }
    
    const csvText = await influxRes.text();
    console.log('InfluxDB response received, parsing CSV...');
    const jsonData = parseCSVtoJSON(csvText);
    console.log('Parsed data:', {
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
      if (range === "30d" || range === "365d") cacheTTL = 3600; // 1 hour
    }
    
    console.log(`Setting cache TTL: ${cacheTTL} seconds for ${jsonData.length} records`);
    await cache.set(cacheKey, jsonData, cacheTTL);
    
    res.json(jsonData);
  } catch (err) {
    console.error("Error fetching historical data:", err);
    res.status(500).json({ error: "Error fetching historical data", details: err.message });
  }
});

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

// ************************************************************
// ***************** /api/export MULTI-VELICINY ***************
// ************************************************************
app.get('/api/export', async (req, res) => {
  const {
    field,
    location,
    start = "0",
    stop = "now()",
    format = "csv"
  } = req.query;

  // Ak field=all alebo field nedefinované => pivot pre všetky veličiny
  let fluxQuery = "";
  if (!field || field === "all") {
    // pivot: dá všetky veličiny do jedného riadku (teplota, vlhkost, atď.)
    fluxQuery = `from(bucket: "${BUCKET}")
      |> range(start: ${start}, stop: ${stop})
      |> filter(fn: (r) => r["_measurement"] == "bme280")` +
      (location
        ? `\n  |> filter(fn: (r) => contains(value: r["location"], set: [${location
            .split(",")
            .map((l) => `"${l}"`)
            .join(",")}]))`
        : "") +
      `
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
      `;
  } else {
    // len filter na _field
    fluxQuery = `from(bucket: "${BUCKET}")
      |> range(start: ${start}, stop: ${stop})
      |> filter(fn: (r) => r["_measurement"] == "bme280")` +
      `\n  |> filter(fn: (r) => r["_field"] == "${field}")` +
      (location
        ? `\n  |> filter(fn: (r) => contains(value: r["location"], set: [${location
            .split(",")
            .map((l) => `"${l}"`)
            .join(",")}]))`
        : "") +
      `
      |> sort(columns: ["_time"])
      `;
  }

  try {
    const influxRes = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${INFLUX_TOKEN}`,
        "Content-Type": "application/vnd.flux",
        "Accept": "application/csv",
      },
      body: fluxQuery,
    });

    if (!influxRes.ok) {
      const errTxt = await influxRes.text();
      console.error("Chyba z InfluxDB:", errTxt);
      return res.status(500).send("Chyba pri načítaní údajov z InfluxDB.");
    }

    // stiahneme csv naraz
    const csvText = await influxRes.text();
    // ak pivot, budú stĺpce: _time, location, teplota, vlhkost, ... atď.

    const byteSize = Buffer.byteLength(csvText, "utf-8");
    const isTooLarge = byteSize > 10 * 1024 * 1024;

    if (format === "json") {
      // CSV => JSON, medzery v stĺpci location => podtržník
      const lines = csvText.split("\n").filter(l => l && !l.startsWith("#"));
      if (lines.length < 2) {
        return res.json([]);
      }
      const headers = lines[0].split(",").map(h => h.trim());
      const locIndex = headers.indexOf("location");

      const dataRows = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",");
        if (!row.length) continue;
        // Nahradíme medzery => _
        if (locIndex >= 0 && row[locIndex]) {
          row[locIndex] = row[locIndex].replace(/ /g, "_");
        }
        dataRows.push(row);
      }
      // prevod do objektov
      const outJson = dataRows.map(r => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = (r[idx] || "").trim();
        });
        return obj;
      });

      const jsonStr = JSON.stringify(outJson, null, 2);
      const jsonBuf = Buffer.from(jsonStr, "utf-8");

      if (isTooLarge) {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="export.zip"');
        const zip = archiver("zip");
        zip.pipe(res);
        zip.append(jsonBuf, { name: "export.json" });
        await zip.finalize();
      } else {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.json"');
        res.send(jsonBuf);
      }
    } else if (format === "lp") {
      // CSV => line-protocol, so that multi-fields from pivot budú v JEDNOM riadku
      // => musíme spraviť "bme280,location=xxx field1=...,field2=...,field3=... timestamp"
      const lpStr = csvPivotToLP(csvText);
      if (!lpStr) {
        return res.send("# (No data)");
      }
      const lpBuf = Buffer.from(lpStr, "utf-8");

      if (lpBuf.length > 10 * 1024 * 1024) {
        // zip
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="export.zip"');
        const zip2 = archiver("zip");
        zip2.pipe(res);
        zip2.append(lpBuf, { name: "export.lp" });
        await zip2.finalize();
      } else {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.lp"');
        res.send(lpBuf);
      }
    } else {
      // CSV => nahradiť v location medzery => "_" a vrátiť
      const lines = csvText.split("\n").filter(l => l && !l.startsWith("#"));
      if (lines.length < 2) {
        // prázdne
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.csv"');
        return res.send(lines.join("\n"));
      }
      const headers = lines[0].split(",").map(h => h.trim());
      const locIndex = headers.indexOf("location");

      const outLines = [headers.join(",")];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",");
        if (!row.length) continue;
        if (locIndex >= 0 && row[locIndex]) {
          row[locIndex] = row[locIndex].replace(/ /g, "_");
        }
        outLines.push(row.join(","));
      }
      const finalCsv = outLines.join("\n");
      const finalCsvBuf = Buffer.from(finalCsv, "utf-8");

      if (finalCsvBuf.length > 10 * 1024 * 1024) {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="export.zip"');
        const zip3 = archiver("zip");
        zip3.pipe(res);
        zip3.append(finalCsvBuf, { name: "export.csv" });
        await zip3.finalize();
      } else {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.csv"');
        res.send(finalCsvBuf);
      }
    }
  } catch (err) {
    console.error("Chyba pri exporte:", err);
    res.status(500).send("Interná chyba servera.");
  }
});

/**
 * csvPivotToLP
 * Predpokladá CSV z pivotu => stĺpce: _time, location, (ďalšie stĺpce = field mená)
 * Pre line-protocol potrebujeme: bme280,location=XYZ field1=...,field2=...,field3=... timestamp
 */
function csvPivotToLP(csvText) {
  const lines = csvText.split("\n").filter(l => l && !l.startsWith("#"));
  if (lines.length < 2) return "";

  const headers = lines[0].split(",").map(h => h.trim());
  const timeIndex = headers.indexOf("_time");
  const locIndex = headers.indexOf("location");

  // zvyšné stĺpce => polia
  // v pivot CSV už NEMÁ _field / _value, ale priamo stĺpce: teplota, vlhkost, ...
  // vynecháme `_time, location, result, table, _measurement` atď.
  const skipCols = new Set(["_time", "location", "result", "table", "_measurement"]);
  const fieldColumns = headers.filter(h => !skipCols.has(h));

  const outLines = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (!row.length) continue;

    // timestamp
    let tsNs = "";
    if (timeIndex >= 0 && row[timeIndex]) {
      const tStr = row[timeIndex].trim();
      const ms = new Date(tStr).getTime();
      if (!isNaN(ms)) {
        tsNs = String(ms * 1e6);
      }
    }
    // location
    let locVal = "";
    if (locIndex >= 0 && row[locIndex]) {
      locVal = row[locIndex].trim().replace(/ /g, "_");
      // escapovať = a ,
      locVal = locVal.replace(/=/g, "\\=").replace(/,/g, "\\,");
    }

    // polia
    const fields = [];
    for (const c of fieldColumns) {
      const colIdx = headers.indexOf(c);
      if (colIdx < 0) continue;
      let val = row[colIdx] || "";
      val = val.trim();
      // ak je prázdne, preskočíme
      if (!val) continue;
      // name=val
      const asNum = parseFloat(val);
      if (!isNaN(asNum)) {
        fields.push(`${c}=${asNum}`);
      } else {
        // line-protocol string => "text"
        const escaped = val.replace(/"/g, '\\"');
        fields.push(`${c}="${escaped}"`);
      }
    }

    if (!fields.length) continue; // žiadne polia => preskočíme

    const measurement = "bme280";
    const tagPart = locVal ? `,location=${locVal}` : "";
    const fieldPart = fields.join(",");
    const line = `${measurement}${tagPart} ${fieldPart}${tsNs ? " " + tsNs : ""}`;
    outLines.push(line);
  }

  return outLines.join("\n");
}

// ==================== LOGIN & SESSIONS ====================
app.use(express.json());

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email/username and password are required' 
    });
  }
  
  try {
    // First check if user exists, regardless of active status
    let user = await users.getUserByCredentials(username);
    
    // If user exists but is inactive
    if (user && user.active === 0) {
      return res.status(403).json({
        success: false,
        error: 'account_disabled',
        message: 'Your account has been disabled. Please contact an administrator.'
      });
    }
    
    // Now authenticate (will also check active status)
    user = await users.authenticate(username, password);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Please check your email/username and password and try again.' 
      });
    }
    
    // Update session with user info
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles
    };
    
    // Return user data
    return res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error. Please try again later.' 
    });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/session', (req, res) => {
  if (req.session.user) {
    return res.json({ 
      loggedIn: true, 
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        email: req.session.user.email,
        roles: req.session.user.roles
      } 
    });
  }
  res.json({ loggedIn: false });
});

// =================== LOCATION COLORS ===================
// Get all location colors
app.get('/api/location-colors', async (req, res) => {
  try {
    const colors = await locationColors.getAll();
    res.json(colors);
  } catch (err) {
    console.error("Error fetching location colors:", err);
    res.status(500).json({ error: 'Failed to fetch location colors' });
  }
});

// Update location colors
app.post('/api/location-colors', async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    console.log("Unauthorized attempt to update location colors - no user session");
    return res.status(401).json({ error: 'Authentication required', message: 'You must be logged in to update location colors' });
  }
  
  const newColors = req.body;
  
  if (!newColors || typeof newColors !== 'object') {
    return res.status(400).json({ error: 'Invalid color data format' });
  }
  
  try {
    console.log(`User ${req.session.user.username} (${req.session.user.email}) updating location colors:`, newColors);
    const result = await locationColors.update(newColors);
    res.json(result);
  } catch (err) {
    console.error("Error updating location colors:", err);
    res.status(500).json({ error: 'Failed to update location colors' });
  }
});

// Get current logged in user
app.get('/api/users/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    id: req.session.user.id,
    username: req.session.user.username,
    email: req.session.user.email,
    roles: req.session.user.roles
  });
});

// List all users (admin only)
app.get('/api/users', async (req, res) => {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const userList = await users.list();
    res.json(userList);
  } catch (err) {
    console.error("Error listing users:", err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create a new user (admin only)
app.post('/api/users', async (req, res) => {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const { username, password, email, roles } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const newUser = await users.create({ username, password, email, roles });
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      roles: newUser.roles
    });
  } catch (err) {
    console.error("Error creating user:", err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update a user (admin only)
app.put('/api/users/:id', async (req, res) => {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const { id } = req.params;
  const { username, email, active, roles } = req.body;
  
  try {
    // Prevent self-deactivation or self-role removal
    if (parseInt(id) === req.session.user.id) {
      if (active === false) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }
      
      if (Array.isArray(roles) && !roles.includes('admin')) {
        return res.status(400).json({ error: 'Cannot remove admin role from your own account' });
      }
    }
    
    const updatedUser = await users.update(parseInt(id), { username, email, active, roles });
    
    // If updating self, update session
    if (parseInt(id) === req.session.user.id) {
      req.session.user = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        roles: updatedUser.roles
      };
    }
    
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      active: updatedUser.active,
      roles: updatedUser.roles
    });
  } catch (err) {
    console.error("Error updating user:", err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete a user (admin only)
app.delete('/api/users/:id', async (req, res) => {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const { id } = req.params;
  
  // Prevent self-deletion
  if (parseInt(id) === req.session.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  try {
    const result = await users.delete(parseInt(id));
    res.json(result);
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// =================== SENZORY & STATUS ===================
app.get('/api/sensors', async (req, res) => {
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
    console.error("Chyba pri načítavaní senzorov:", err);
    res.status(500).json({ error: "Chyba pri čítaní InfluxDB" });
  }
});

app.get('/api/sensors/status', async (req, res) => {
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
    console.error("Chyba pri získavaní statusov:", err);
    res.status(500).json({ error: "Chyba pri získavaní statusov" });
  }
});

app.post('/api/sensors/:name/visibility', (req, res) => {
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

//MAZANIE V INFLUX
app.post("/api/delete-location", async (req, res) => {
  // Očakávame JSON telo, napr. { location: "IT_OFFICE" }
  const { location } = req.body;
  if (!location) {
    return res.status(400).send("Chýba parameter 'location'.");
  }

  try {
    // DELETE body: definujeme čas a predikát
    const bodyJson = {
      start: "1970-01-01T00:00:00Z",
      stop: "2100-01-01T00:00:00Z",
      predicate: `_measurement="bme280" AND location="${location}"`
    };

    const deleteUrl = `${INFLUX_URL}/api/v2/delete?org=${ORG}&bucket=${BUCKET}`;
    const influxRes = await fetch(deleteUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${INFLUX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyJson),
    });

    if (!influxRes.ok) {
      const errText = await influxRes.text();
      return res
        .status(500)
        .send(`Nepodarilo sa vymazať lokáciu: ${influxRes.statusText}\n${errText}`);
    }

    res.status(200).send(`Lokácia '${location}' bola zmazaná.`);
  } catch (err) {
    console.error("Chyba pri mazaní lokácie:", err);
    res.status(500).send("Chyba pri mazaní lokácie.");
  }
});

// =================== USER SETTINGS ===================
// Get all settings for the current user
app.get('/api/user-settings', async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required', message: 'You must be logged in to access settings' });
  }
  
  try {
    const settings = await userSettings.getAll(req.session.user.id);
    res.json(settings);
  } catch (err) {
    console.error("Error fetching user settings:", err);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// Get a specific setting
app.get('/api/user-settings/:key', async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required', message: 'You must be logged in to access settings' });
  }
  
  const { key } = req.params;
  
  try {
    const value = await userSettings.get(req.session.user.id, key);
    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ [key]: value });
  } catch (err) {
    console.error(`Error fetching user setting ${key}:`, err);
    res.status(500).json({ error: 'Failed to fetch user setting' });
  }
});

// Update a user setting
app.post('/api/user-settings/:key', async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required', message: 'You must be logged in to update settings' });
  }
  
  const { key } = req.params;
  const { value } = req.body;
  
  if (value === undefined) {
    return res.status(400).json({ error: 'Missing value parameter' });
  }
  
  try {
    console.log(`User ${req.session.user.username} (ID: ${req.session.user.id}) updating setting ${key}`);
    const result = await userSettings.set(req.session.user.id, key, value);
    res.json(result);
  } catch (err) {
    console.error(`Error updating user setting ${key}:`, err);
    res.status(500).json({ error: 'Failed to update user setting' });
  }
});

// Delete a user setting
app.delete('/api/user-settings/:key', async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required', message: 'You must be logged in to delete settings' });
  }
  
  const { key } = req.params;
  
  try {
    const result = await userSettings.delete(req.session.user.id, key);
    res.json(result);
  } catch (err) {
    console.error(`Error deleting user setting ${key}:`, err);
    res.status(500).json({ error: 'Failed to delete user setting' });
  }
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Admin role middleware
function isAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// API endpoint to reset user password (admin only)
app.post('/api/users/:id/reset-password', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  
  console.log(`Password reset attempt for user ID ${id} by admin ${req.session.user.username} (ID: ${req.session.user.id})`);
  
  if (!newPassword) {
    console.error('Password reset failed: No password provided');
    return res.status(400).json({ error: 'New password is required' });
  }
  
  if (newPassword.length < 8) {
    console.error('Password reset failed: Password too short');
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  
  // Use the resetUserPassword function with Promise handling
  resetUserPassword(parseInt(id), newPassword)
    .then(result => {
      console.log(`Password reset successful for user ID ${id}`);
      return res.json(result);
    })
    .catch(error => {
      console.error(`Password reset function error: ${error.message}`);
      return res.status(500).json({ error: error.message || 'Failed to reset password' });
    });
});

// ================== STATIC & START ==================
const staticPath = path.join(__dirname, '..', 'frontend/dist');

// Check if the dist folder exists, if not create a placeholder file
if (!fs.existsSync(staticPath)) {
  console.warn(`Warning: Static files directory (${staticPath}) does not exist.`);
  console.warn('Run "npm run build" in the frontend directory to create production files.');
  
  // Create the directory structure
  fs.mkdirSync(staticPath, { recursive: true });
  
  // Create a simple placeholder index.html
  const placeholderHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Development Mode</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .warning { background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
    code { background-color: #f8f9fa; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Dashboard - Development Mode</h1>
  <div class="warning">
    <h2>⚠️ Frontend not built</h2>
    <p>The production build of the frontend has not been created yet.</p>
    <p>To build the frontend, run:</p>
    <pre><code>cd frontend && npm run build</code></pre>
    <p>Or during development, you can access the dashboard through the Vite development server at:</p>
    <pre><code>http://localhost:5173</code></pre>
  </div>
</body>
</html>
  `;
  
  fs.writeFileSync(path.join(staticPath, 'index.html'), placeholderHtml);
}

app.use(express.static(staticPath));

// Protect admin routes - redirect to login page if not authenticated
// Use a regex to match any path starting with /admin
app.use(/^\/admin($|\/)/, (req, res, next) => {
  if (!req.session.user) {
    console.log(`Unauthorized access attempt to admin area: ${req.path}`);
    return res.redirect('/login');
  }
  next();
});

app.use((req, res) => {
  // If this is an API request that wasn't handled by any of the API routes,
  // return a proper JSON error instead of the HTML file
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Not Found', 
      message: 'The requested API endpoint does not exist'
    });
  }
  
  // For non-API routes, serve the index.html file
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ================== SERVER STARTUP ==================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server beží na porte ${PORT}`);
});

// Keep the process alive
process.stdin.resume();

// Handle graceful shutdown
let shuttingDown = false;

process.on('SIGINT', () => {
  console.log('SIGINT received. Use Ctrl+C again to force exit.');
  
  if (shuttingDown) {
    console.log('Forcing exit...');
    process.exit(0);
  }
  
  shuttingDown = true;
  
  // Reset shutting down flag after 5 seconds
  setTimeout(() => {
    shuttingDown = false;
  }, 5000);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Server will continue running.');
});

async function gracefulShutdown() {
  console.log('Closing database connection...');
  try {
    await closeDatabase();
    console.log('Database connection closed successfully');
    server.close(() => {
      console.log('Server closed successfully');
      // Don't call process.exit(0) here to prevent automatic shutdown
    });
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    // Don't call process.exit(1) here to prevent automatic shutdown
  }
}

// Export app for testing purposes
module.exports = app;

// Add a global error handler for unhandled exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - just log the error
});

// Add a global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Don't exit - just log the error
});

// ******************* EXPORT *******************
// Modify to use the queue for async processing
app.get('/api/export/:type', async (req, res) => {
  const { type } = req.params;
  const { locations, range } = req.query;
  
  if (!locations) {
    return res.status(400).send('Missing locations parameter');
  }
  
  const locArray = locations.split(',');
  
  if (exportQueue) {
    try {
      // Use the queue for processing 
      const job = await exportQueue.add({
        type,
        locations: locArray,
        range: range || '24h',
        filename: `sensor_data_${new Date().toISOString().replace(/:/g, '-')}.${type === 'excel' ? 'xlsx' : 'csv'}`
      });
      
      return res.json({
        status: 'processing',
        jobId: job.id,
        message: 'Export job has been queued and will be processed shortly'
      });
    } catch (error) {
      console.error('Error queueing export job:', error);
      return res.status(500).send('Error starting export process');
    }
  } else {
    // Fallback to synchronous processing if queue is not available
    // ... [existing export logic] ...
  }
});

// Add a new endpoint to check export job status
app.get('/api/export/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  if (!exportQueue) {
    return res.status(503).send('Export queue is not available');
  }
  
  try {
    // Mocked job status check - in a real implementation you'd check the job status in Bull or other queue
    return res.json({
      status: 'completed',
      message: 'Export has been completed successfully',
      downloadUrl: `/api/exports/${jobId}`
    });
  } catch (error) {
    console.error('Error checking export status:', error);
    return res.status(500).send('Error checking export status');
  }
});
