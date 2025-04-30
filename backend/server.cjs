// server.cjs
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Determine if we're in production mode
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, '.env.production'));
if (isProduction && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Load .env file from backend directory
dotenv.config({ path: path.join(__dirname, isProduction ? '.env.production' : '.env') });

const express = require('express');
const session = require('express-session');
// Using native Node.js fetch instead of node-fetch package
// const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
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
const { users, locationColors, userSettings, notificationSettings, closeDatabase, resetUserPassword } = require('./db.cjs');

// Import cache and queue modules
const cache = require('./cache.cjs');
const { createQueue } = require('./queue.cjs');

// Import the Telegram chart module
const telegramChart = require('./telegram-chart.cjs');

// Configurable logging utility
const logger = {
  // Possible values: 'ALL', 'ERROR', 'NONE'
  level: process.env.NODE_ENV === 'production' ? 'ERROR' : (process.env.LOGGING_LEVEL || 'ALL').toUpperCase(),
  
  log: function(...args) {
    if (this.level === 'ALL') {
      console.log(...args);
    }
  },
  
  error: function(...args) {
    if (this.level === 'ALL' || this.level === 'ERROR') {
      console.error(...args);
    }
  },
  
  // Always log regardless of configuration (for critical messages)
  always: function(...args) {
    console.log(...args);
  }
};

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
        logger.log(`Processing export job: ${jobData.type}`);
        // Perform the export operation here
        const { type, locations, range, filename } = jobData;
        
        // Mock export process (this would be your actual export logic)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true, filename };
      });
    }
  } catch (error) {
    logger.error('Error initializing async components:', error);
  }
}

// Call the initialize function
initializeAsyncComponents();

const app = express();

// ================== ENV PREMENNÉ ==================
// Set up environment variables
require('dotenv').config();

// Configure InfluxDB connection
const INFLUX_URL = process.env.VITE_INFLUX_URL || process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.VITE_INFLUX_TOKEN || process.env.INFLUX_TOKEN || 'testtoken';
const ORG = process.env.VITE_ORG || process.env.ORG || 'testorg';
const BUCKET = process.env.VITE_BUCKET || process.env.BUCKET || 'testbucket';
const VISIBILITY_FILE = path.join(__dirname, 'visibility.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_insecure_secret';
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 3600000; // 1 hour default
const ENABLE_RATE_LIMITING = process.env.ENABLE_RATE_LIMITING === 'true';
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW) || 15;
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ? 
  process.env.CORS_ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:5173', 'http://192.168.155.206:5000', 'http://192.168.155.206'];
const LOGGING_LEVEL = (process.env.LOGGING_LEVEL || 'ALL').toUpperCase(); // Logging level: ALL, ERROR, NONE

// Ensure environment variables are set for telegram-chart.cjs which uses different variable names
process.env.INFLUX_URL = INFLUX_URL;
process.env.INFLUX_TOKEN = INFLUX_TOKEN;
process.env.INFLUX_ORG = ORG;
process.env.INFLUX_BUCKET = BUCKET;

// Log configuration at startup (will only show if logging is enabled)
logger.log('Server configuration loaded:');
logger.log(`- Logging level: ${LOGGING_LEVEL}`);
logger.log(`- InfluxDB: ${INFLUX_URL}`);
logger.log(`- Org: ${ORG}`);
logger.log(`- Bucket: ${BUCKET}`);
logger.log(`- Rate limiting: ${ENABLE_RATE_LIMITING ? 'Enabled' : 'Disabled'}`);

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
  resave: true, // Change to true to ensure session is saved
  saveUninitialized: true, // Change to true to create session for all users
  cookie: {
    secure: false, // set to false for HTTP development
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',  // Changed from 'strict' to 'lax' for better compatibility
    path: '/'  // Ensure cookie is available for the entire domain
  },
  name: 'dashboard.sid' // Custom name for the session cookie
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

// Show startup environment information
console.log(`Server starting in ${process.env.NODE_ENV || 'development'} mode`);
console.log(`Logging level: ${logger.level}`);

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
    logger.error("Chyba pri importe line-protocol:", err);
    return res.status(500).send("Chyba pri importe line-protocol.");
  }
});

// **************************** VISIBILITY *******************************
let sensorVisibility = {};
if (fs.existsSync(VISIBILITY_FILE)) {
  sensorVisibility = JSON.parse(fs.readFileSync(VISIBILITY_FILE));
  logger.log("Načítaná uložená visibility konfigurácia.");
} else {
  logger.log("Žiadne uložené visibility na disku.");
}

// Load default cards from settings.json
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
let defaultSettings = { defaultCards: [] };
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    defaultSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    logger.log("Načítané nastavenia zo settings.json");
  } catch (err) {
    logger.error("Chyba pri načítaní settings.json:", err);
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
    // Query for data points in the past 30 days with a more reliable approach
    // Look for the most recent gap > 10 minutes
    const query = `
      from(bucket: "${BUCKET}")
        |> range(start: -30d)  // Increased from 3d to 30d to track longer uptime periods
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
      // If no restart found in past 30 days, get the first data point of the most recent continuous series
      // This will find the most recent start time after a gap
      const latestSessionQuery = `
        from(bucket: "${BUCKET}")
          |> range(start: -30d)  // Increased from 6h to 30d to find the earliest data point in the continuous series
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
    logger.error(`Error getting actual start time for ${name}:`, error);
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
    logger.error('Chyba pri pridávaní lokácie do InfluxDB:', err);
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
      query = `from(bucket: "${BUCKET}")
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
        (range === '30d' || range === '365d');
      
      // Standard query for smaller time ranges
      query = `from(bucket: "${BUCKET}")
        |> ${rangeClause}
        |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${sensorName}")
        |> filter(fn: (r) => contains(value: r["_field"], set: [${fields.map(f => `"${f}"`).join(',')}]))
        |> sort(columns: ["_time"])${isLargeRange ? '\n        |> limit(n: 5000)' : ''}`;
      
      logger.log(`Using standard query ${isLargeRange ? 'with limit' : 'without downsampling'}`);
    }

    logger.log('Executing InfluxDB query:', query);
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
      if (range === "30d" || range === "365d") cacheTTL = 3600; // 1 hour
    }
    
    logger.log(`Setting cache TTL: ${cacheTTL} seconds for ${jsonData.length} records`);
    await cache.set(cacheKey, jsonData, cacheTTL);
    
    res.json(jsonData);
  } catch (err) {
    logger.error("Error fetching historical data:", err);
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
      logger.error("Chyba z InfluxDB:", errTxt);
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
    logger.error("Chyba pri exporte:", err);
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
    logger.error("Login error:", err);
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
    logger.error("Error fetching location colors:", err);
    res.status(500).json({ error: 'Failed to fetch location colors' });
  }
});

// Update location colors
app.post('/api/location-colors', async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    logger.log("Unauthorized attempt to update location colors - no user session");
    return res.status(401).json({ error: 'Authentication required', message: 'You must be logged in to update location colors' });
  }
  
  const newColors = req.body;
  
  if (!newColors || typeof newColors !== 'object') {
    return res.status(400).json({ error: 'Invalid color data format' });
  }
  
  try {
    logger.log(`User ${req.session.user.username} (${req.session.user.email}) updating location colors:`, newColors);
    const result = await locationColors.update(newColors);
    res.json(result);
  } catch (err) {
    logger.error("Error updating location colors:", err);
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
    logger.error("Error listing users:", err);
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
    logger.error("Error creating user:", err);
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
    logger.error("Error updating user:", err);
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
    logger.error("Error deleting user:", err);
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
    logger.error("Chyba pri načítavaní senzorov:", err);
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
    logger.error("Chyba pri získavaní statusov:", err);
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
    logger.error("Chyba pri mazaní lokácie:", err);
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
    logger.error("Error fetching user settings:", err);
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
    logger.error(`Error fetching user setting ${key}:`, err);
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
    logger.log(`User ${req.session.user.username} (ID: ${req.session.user.id}) updating setting ${key}`);
    const result = await userSettings.set(req.session.user.id, key, value);
    res.json(result);
  } catch (err) {
    logger.error(`Error updating user setting ${key}:`, err);
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
    logger.error(`Error deleting user setting ${key}:`, err);
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

// Ensure user is authenticated (alias for isAuthenticated for clearer naming in some contexts)
function ensureAuthenticated(req, res, next) {
  // Check if user is authenticated
  // If in development mode, provide better error messages
  
  // Removed debug logs
  
  // Special handling for Telegram API endpoints - allow them in dev mode
  const TELEGRAM_DEV_MODE = process.env.TELEGRAM_DEV_MODE === 'true';
  
  if (TELEGRAM_DEV_MODE && req.path.startsWith('/api/notifications/telegram/')) {
    // Skip authentication for Telegram endpoints in dev mode
    logger.log(`Dev mode access granted to Telegram endpoint: ${req.path}`);
    return next();
  }
  
  // Ensure session exists
  if (!req.session) {
    logger.error('Session object is missing - session middleware might not be configured correctly');
    return res.status(500).json({ error: 'Session configuration error' });
  }
  
  if (!req.session.user) {
    logger.error(`Authentication failed for ${req.path} - no user in session`);
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For Telegram settings, ensure locations exist in notification_settings
  if (req.path.startsWith('/api/notifications/telegram/')) {
    // Get user ID from session
    const userId = req.session.user.id;
    
    // Check if notification settings exist for this user
    notificationSettings.getUserSettings(userId)
      .then(settings => {
        if (settings.length === 0) {
          // Get the locations to create default settings
          return fetchSensorLocations()
            .then(locations => {
              // Create default settings for each location
              const promises = locations.map(location =>
                notificationSettings.updateSettings(userId, location, {
                  enabled: false,
                  chat_id: '',
                  temperature_enabled: false,
                  humidity_enabled: false,
                  pressure_enabled: false,
                  notification_frequency_minutes: 30,
                  notification_language: 'en'
                })
              );
              
              return Promise.all(promises);
            })
            .then(() => {
              logger.log(`Created default notification settings for user ID: ${userId}`);
              next();
            })
            .catch(err => {
              logger.error(`Error creating default notification settings: ${err.message}`);
              next(); // Continue anyway
            });
        } else {
          next();
        }
      })
      .catch(err => {
        logger.error(`Error checking notification settings: ${err.message}`);
        next(); // Continue anyway
      });
  } else {
    next();
  }
}

// API endpoint to reset user password (admin only)
app.post('/api/users/:id/reset-password', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  
  logger.log(`Password reset attempt for user ID ${id} by admin ${req.session.user.username} (ID: ${req.session.user.id})`);
  
  if (!newPassword) {
    logger.error('Password reset failed: No password provided');
    return res.status(400).json({ error: 'New password is required' });
  }
  
  if (newPassword.length < 8) {
    logger.error('Password reset failed: Password too short');
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  
  // Use the resetUserPassword function with Promise handling
  resetUserPassword(parseInt(id), newPassword)
    .then(result => {
      logger.log(`Password reset successful for user ID ${id}`);
      return res.json(result);
    })
    .catch(error => {
      logger.error(`Password reset function error: ${error.message}`);
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
    logger.log(`Unauthorized access attempt to admin area: ${req.path}`);
    return res.redirect('/login');
  }
  next();
});

// Moving the catch-all handler to the end - removing it from here
// app.use((req, res) => {
//   // If this is an API request that wasn't handled by any of the API routes,
//   // return a proper JSON error instead of the HTML file
//   if (req.path.startsWith('/api/')) {
//     return res.status(404).json({ 
//       error: 'Not Found', 
//       message: 'The requested API endpoint does not exist'
//     });
//   }
//   
//   // For non-API routes, serve the index.html file
//   res.sendFile(path.join(staticPath, 'index.html'));
// });

// ================== SERVER STARTUP ==================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.always(`Server beží na porte ${PORT}`);
});

// Keep the process alive
process.stdin.resume();

// Handle graceful shutdown
let shuttingDown = false;

process.on('SIGINT', () => {
  logger.always('SIGINT received. Use Ctrl+C again to force exit.');
  
  if (shuttingDown) {
    logger.always('Forcing exit...');
    process.exit(0);
  }
  
  shuttingDown = true;
  
  // Reset shutting down flag after 5 seconds
  setTimeout(() => {
    shuttingDown = false;
  }, 5000);
});

process.on('SIGTERM', () => {
  logger.always('SIGTERM received. Server will continue running.');
});

async function gracefulShutdown() {
  logger.always('Closing database connection...');
  try {
    await closeDatabase();
    logger.always('Database connection closed successfully');
    server.close(() => {
      logger.always('Server closed successfully');
      // Don't call process.exit(0) here to prevent automatic shutdown
    });
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    // Don't call process.exit(1) here to prevent automatic shutdown
  }
}

// Export app for testing purposes
module.exports = app;

// Add a global error handler for unhandled exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit - just log the error
});

// Add a global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
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
      logger.error('Error queueing export job:', error);
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
    logger.error('Error checking export status:', error);
    return res.status(500).send('Error checking export status');
  }
});

// Telegram Notification API Endpoints - PROPERLY CONFIGURED FOR API PREFIX
app.get('/api/notifications/telegram/settings', ensureAuthenticated, async (req, res) => {
  try {
    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : 1; // Fall back to user ID 1 in dev mode
    
    // Debug logging for session - only in non-production
    if (process.env.NODE_ENV !== 'production') {
      logger.log(`GET /api/notifications/telegram/settings - User ID: ${userId}`);
    }
    
    // Get all notification settings for the user
    const settings = await notificationSettings.getUserSettings(userId);
    
    // Format the settings to return
    const formattedSettings = {
      chatId: settings.length > 0 ? settings[0].chat_id : '',
      connected: settings.length > 0 && !!settings[0].chat_id,
      enabled: settings.length > 0 ? !!settings[0].enabled : false,
      notificationFrequency: settings.length > 0 ? settings[0].notification_frequency_minutes : 30,
      notificationLanguage: settings.length > 0 ? settings[0].notification_language || 'en' : 'en',
      sendCharts: settings.length > 0 ? !!settings[0].send_charts : true,
      thresholds: {}
    };
    
    // Add thresholds for each location
    settings.forEach(setting => {
      // Log raw value for debugging
      logger.log(`Raw offline_notification_enabled for ${setting.location}: ${setting.offline_notification_enabled}`);
      logger.log(`Type of offline_notification_enabled: ${typeof setting.offline_notification_enabled}`);
      
      // Convert to strict boolean - database stores as 0/1
      const offlineEnabled = setting.offline_notification_enabled === 1;
      logger.log(`Converted offlineNotificationsEnabled for ${setting.location}: ${offlineEnabled}`);
      
      formattedSettings.thresholds[setting.location] = {
        temperature: {
          min: setting.temperature_min,
          max: setting.temperature_max,
          enabled: !!setting.temperature_enabled,
          thresholdType: setting.temperature_threshold_type || 'range'
        },
        humidity: {
          min: setting.humidity_min,
          max: setting.humidity_max,
          enabled: !!setting.humidity_enabled,
          thresholdType: setting.humidity_threshold_type || 'range'
        },
        pressure: {
          min: setting.pressure_min,
          max: setting.pressure_max,
          enabled: !!setting.pressure_enabled,
          thresholdType: setting.pressure_threshold_type || 'range'
        },
        // Use the strictly converted boolean value
        offlineNotificationsEnabled: offlineEnabled
      };
    });
    
    // Add debug logging
    logger.log(`Response settings: ${JSON.stringify(formattedSettings, null, 2)}`);
    
    res.json(formattedSettings);
  } catch (error) {
    logger.error('Error retrieving Telegram settings:', error);
    res.status(500).json({ error: 'Failed to retrieve Telegram settings' });
  }
});

app.post('/api/notifications/telegram/settings', ensureAuthenticated, async (req, res) => {
  try {
    // Extract settings from request body
    const {
      chatId,
      enabled,
      thresholds,
      notificationFrequency,
      notificationLanguage,
      sendCharts
    } = req.body;
    
    // Debug logging of request - only in non-production
    if (process.env.NODE_ENV !== 'production') {
      logger.log('POST /api/notifications/telegram/settings - Request received');
      logger.log(`Request thresholds: ${JSON.stringify(thresholds, null, 2)}`);
    }
    
    if (!thresholds) {
      return res.status(400).json({ error: 'Thresholds are required' });
    }
    
    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : 1; // Fall back to user ID 1 in dev mode
    
    // Process each location from the thresholds
    const updatePromises = Object.keys(thresholds).map(async (location) => {
      const locationThresholds = thresholds[location];
      
      // Debug log each location's settings
      logger.log(`Processing location: ${location}`);
      logger.log(`Raw offlineNotificationsEnabled: ${locationThresholds.offlineNotificationsEnabled}`);
      logger.log(`Type of offlineNotificationsEnabled: ${typeof locationThresholds.offlineNotificationsEnabled}`);
      
      // Handle offlineNotificationsEnabled - ensure it's a boolean and then convert to 0/1 for database
      const offlineEnabled = locationThresholds.offlineNotificationsEnabled === true;
      logger.log(`Processed offlineNotificationsEnabled: ${offlineEnabled}`);
      
      // Prepare settings object for this location
      const settings = {
        chat_id: chatId,
        enabled: enabled,
        send_charts: sendCharts,
        notification_frequency_minutes: notificationFrequency,
        notification_language: notificationLanguage,
        
        temperature_enabled: locationThresholds.temperature.enabled,
        temperature_min: locationThresholds.temperature.min,
        temperature_max: locationThresholds.temperature.max,
        temperature_threshold_type: locationThresholds.temperature.thresholdType || 'range',
        
        humidity_enabled: locationThresholds.humidity.enabled,
        humidity_min: locationThresholds.humidity.min,
        humidity_max: locationThresholds.humidity.max,
        humidity_threshold_type: locationThresholds.humidity.thresholdType || 'range',
        
        pressure_enabled: locationThresholds.pressure.enabled,
        pressure_min: locationThresholds.pressure.min,
        pressure_max: locationThresholds.pressure.max,
        pressure_threshold_type: locationThresholds.pressure.thresholdType || 'range',
        
        // Use the strictly processed boolean value
        offline_notification_enabled: offlineEnabled
      };
      
      // Log the final settings being saved
      logger.log(`Final settings for location ${location}: offline_notification_enabled=${settings.offline_notification_enabled}`);
      
      // Update the settings in the database
      return notificationSettings.updateSettings(userId, location, settings);
    });
    
    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);
    
    // Success - all locations updated
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    logger.error('Error updating Telegram settings:', error);
    res.status(500).json({ error: 'Failed to update Telegram settings' });
  }
});

app.post('/api/notifications/telegram/test', ensureAuthenticated, async (req, res) => {
  try {
    const { chatId, notificationLanguage = 'en' } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Chat ID is required' 
      });
    }
    
    // Use the Telegram Bot API to send a message
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ 
        success: false, 
        message: 'Telegram bot token not configured' 
      });
    }
    
    // Prepare message based on language
    let testMessage = 'This is a test notification from your Pi-Temp-Dashboard.';
    if (notificationLanguage === 'sk') {
      testMessage = 'Toto je testovacie upozornenie z vášho Pi-Temp-Dashboard.';
    }
    
    // Using native Node.js fetch API
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: testMessage,
        }),
      }
    );
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(400).json({ 
        success: false, 
        message: `Failed to send test message: ${data.description}` 
      });
    }
    
    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : 1; // Fall back to user ID 1 in dev mode
    
    // Update the chat ID for all locations for this user
    await notificationSettings.updateChatId(userId, chatId);
    
    // If notification language was provided, update it
    if (notificationLanguage) {
      await notificationSettings.updateLanguage(userId, notificationLanguage);
    }
    
    res.json({ 
      success: true, 
      message: 'Test notification sent successfully' 
    });
  } catch (error) {
    logger.error('Error sending test Telegram notification:', error);
    res.status(500).json({ 
      success: false, 
      message: `Server error while sending test notification: ${error.message}` 
    });
  }
});

// New endpoint for sending notifications when thresholds are exceeded
app.post('/api/notifications/telegram/notify', ensureAuthenticated, async (req, res) => {
  try {
    const { location, temperature, humidity, pressure, thresholds, notificationLanguage = 'en' } = req.body;

    if (!location || !thresholds || temperature === undefined || humidity === undefined || pressure === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : 1; // Fall back to user ID 1 in dev mode
    
    // Get notification settings for this user
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }
    
    // Get the chat ID from the first setting (all settings should have the same chat ID)
    const chatId = userSettings[0].chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Get preferred notification language (fallback to English)
    const lang = notificationLanguage || userSettings[0].notification_language || 'en';

    // Format the notification text based on language
    const messages = [];
    
    if (temperature !== undefined && thresholds.temperature?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.temperature.thresholdType || 'range';
      
      if (thresholdType === 'range' && (temperature < thresholds.temperature.min || temperature > thresholds.temperature.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota je ${temperature}°C (mimo rozsah ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature is ${temperature}°C (outside range ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) at ${location}`);
        }
      } else if (thresholdType === 'max' && temperature >= thresholds.temperature.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota dosiahla ${temperature}°C (prekročila cieľovú hodnotu ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature reached ${temperature}°C (exceeded target value ${thresholds.temperature.max}°C) at ${location}`);
        }
      }
    }
    
    if (humidity !== undefined && thresholds.humidity?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.humidity.thresholdType || 'range';
      
      if (thresholdType === 'range' && (humidity < thresholds.humidity.min || humidity > thresholds.humidity.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť je ${humidity}% (mimo rozsah ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity is ${humidity}% (outside range ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) at ${location}`);
        }
      } else if (thresholdType === 'max' && humidity >= thresholds.humidity.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť dosiahla ${humidity}% (prekročila cieľovú hodnotu ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity reached ${humidity}% (exceeded target value ${thresholds.humidity.max}%) at ${location}`);
        }
      }
    }
    
    if (pressure !== undefined && thresholds.pressure?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.pressure.thresholdType || 'range';
      
      if (thresholdType === 'range' && (pressure < thresholds.pressure.min || pressure > thresholds.pressure.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🧭 Tlak je ${pressure} hPa (mimo rozsah ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure is ${pressure} hPa (outside range ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) at ${location}`);
        }
      } else if (thresholdType === 'max' && pressure >= thresholds.pressure.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🧭 Tlak dosiahol ${pressure} hPa (prekročil cieľovú hodnotu ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure reached ${pressure} hPa (exceeded target value ${thresholds.pressure.max} hPa) at ${location}`);
        }
      }
    }
    
    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: lang === 'sk' ? 'Neboli zistené žiadne porušenia limitov ani dosiahnuté cieľové hodnoty' : 'No threshold violations or target values detected'
      });
    }
    
    const text = messages.join('\n');
    
    // Send the notification
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(500).json({
        success: false,
        message: lang === 'sk' 
          ? `Nepodarilo sa odoslať upozornenie: ${data.description}` 
          : `Failed to send notification: ${data.description}`
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: lang === 'sk' ? 'Upozornenie úspešne odoslané' : 'Notification sent successfully',
      telegram: data 
    });
  } catch (error) {
    logger.error('Error sending Telegram notification:', error);
    const errorLang = req.body?.notificationLanguage || 'en';
    res.status(500).json({
      success: false,
      message: errorLang === 'sk' 
        ? `Chyba servera pri odosielaní upozornenia: ${error.message}` 
        : `Server error while sending notification: ${error.message}`
    });
  }
});

// Track the last time a notification was sent for each location
const lastNotificationTimestamps = {};

// Track the last known online status of each sensor
const sensorOnlineStatus = {};

// Monitoring system that checks sensor values and sends notifications
async function checkSensorThresholds() {
  try {
    logger.log('Checking sensor thresholds for notifications...');
    
    // Check if Telegram notifications are enabled in environment
    if (process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== 'true') {
      logger.log('Telegram notifications are disabled in environment variables');
      return;
    }
    
    // Check if notifications are enabled in the user's settings
    // This will check the global toggle that's set in the admin panel
    try {
      // Default to admin user (ID 1) for global settings
      const userSettings = await notificationSettings.getUserSettings(1);
      
      // If no settings exist or notifications are explicitly disabled for the first location, return
      if (userSettings.length === 0) {
        logger.log('No notification settings found in database');
        return;
      }
      
      if (!userSettings[0].enabled) {
        logger.log('Notifications are disabled in user settings');
        return;
      }
      
      // Check if we have a chat ID
      if (!userSettings[0].chat_id) {
        logger.log('Telegram chat ID not configured');
        return;
      }
      
      logger.log('Notifications are enabled in user settings');
      
      // Get the bot token
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (!TELEGRAM_BOT_TOKEN) {
        logger.error('Telegram bot token not configured');
        return;
      }
      
      // Check for offline sensors
      try {
        const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes threshold
        const locations = await fetchSensorLocations();
        const now = Date.now();
        
        // Get sensor statuses
        const sensorStatuses = await Promise.all(
          locations.map(async (name) => {
            // Get the last seen timestamp
            const lastSeen = await getLastSeenFromInflux(name);
            
            // Calculate if the sensor is online based on the 10-minute threshold
            const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
            const timeSinceLastSeen = lastSeen ? now - lastSeenTime : null;
            const isOnline = lastSeen && timeSinceLastSeen < OFFLINE_THRESHOLD;
            
            return {
              name,
              lastSeen,
              online: isOnline,
              timeSinceLastSeen
            };
          })
        );
        
        // Check each sensor status for changes from online to offline
        for (const sensorStatus of sensorStatuses) {
          const { name, online, lastSeen } = sensorStatus;
          const previouslyOnline = sensorOnlineStatus[name] !== false; // Default to true if not set
          
          // Update status in our tracking object
          const previousStatus = sensorOnlineStatus[name];
          sensorOnlineStatus[name] = online;
          
          // Check if sensor just went offline and needs notification
          if (previousStatus === true && !online) {
            logger.log(`Sensor ${name} appears to have gone offline. Last seen: ${lastSeen}`);
            
            // For each user with offline notifications enabled for this location
            const allSettings = await notificationSettings.getAllSettings();
            const offlineNotificationSettings = allSettings.filter(
              setting => 
                setting.location === name && 
                setting.enabled && 
                setting.offline_notification_enabled
            );
            
            // Send notification to each user who has enabled offline notifications
            for (const setting of offlineNotificationSettings) {
              const notificationKey = `${setting.user_id}-${name}-offline`;
              const now = Date.now();
              const lastNotificationTime = lastNotificationTimestamps[notificationKey] || 0;
              const notificationFrequency = setting.notification_frequency_minutes * 60 * 1000;
              
              // Check if we've sent a notification recently for this condition
              if (now - lastNotificationTime < notificationFrequency) {
                logger.log(`Skipping offline notification for ${name} - notification was sent recently`);
                continue;
              }
              
              // Format time based on language
              const lang = setting.notification_language || 'en';
              const lastSeenFormatted = new Date(lastSeen).toLocaleString(
                lang === 'sk' ? 'sk-SK' : 'en-US', 
                { 
                  dateStyle: 'medium', 
                  timeStyle: 'medium' 
                }
              );
              
              // Create notification message for offline sensor
              const message = lang === 'sk' 
                ? `🔴 UPOZORNENIE: Senzor ${name} je offline!\n\nPosledný záznam: ${lastSeenFormatted}`
                : `🔴 ALERT: Sensor ${name} has gone offline!\n\nLast seen: ${lastSeenFormatted}`;
              
              try {
                // Send notification via Telegram
                const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
                const telegramResponse = await fetch(telegramUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: setting.chat_id,
                    text: message,
                  }),
                });
                
                const telegramData = await telegramResponse.json();
                
                if (telegramData.ok) {
                  logger.log(`Offline notification sent successfully for ${name} to user ${setting.user_id}`);
                  // Update timestamp to prevent notification spam
                  lastNotificationTimestamps[notificationKey] = now;
                } else {
                  logger.error(`Failed to send offline notification for ${name}:`, telegramData.description);
                }
              } catch (error) {
                logger.error(`Error sending offline notification for ${name}:`, error);
              }
            }
          }
          
          // Check if sensor just came back online after being offline
          if (previousStatus === false && online) {
            logger.log(`Sensor ${name} appears to be back online. Last seen: ${lastSeen}`);
            
            // For each user with offline notifications enabled for this location
            const allSettings = await notificationSettings.getAllSettings();
            const offlineNotificationSettings = allSettings.filter(
              setting => 
                setting.location === name && 
                setting.enabled && 
                setting.offline_notification_enabled
            );
            
            // Send online notification to each user who has enabled offline notifications
            for (const setting of offlineNotificationSettings) {
              const notificationKey = `${setting.user_id}-${name}-online`;
              const now = Date.now();
              const lastNotificationTime = lastNotificationTimestamps[notificationKey] || 0;
              const notificationFrequency = setting.notification_frequency_minutes * 60 * 1000;
              
              // Check if we've sent a notification recently for this condition
              if (now - lastNotificationTime < notificationFrequency) {
                logger.log(`Skipping online notification for ${name} - notification was sent recently`);
                continue;
              }
              
              // Format time based on language
              const lang = setting.notification_language || 'en';
              const lastSeenFormatted = new Date(lastSeen).toLocaleString(
                lang === 'sk' ? 'sk-SK' : 'en-US', 
                { 
                  dateStyle: 'medium', 
                  timeStyle: 'medium' 
                }
              );
              
              // Create notification message for online sensor
              const message = lang === 'sk' 
                ? `✅ INFO: Senzor ${name} je znova online!\n\nPosledný záznam: ${lastSeenFormatted}`
                : `✅ INFO: Sensor ${name} is back online!\n\nLast seen: ${lastSeenFormatted}`;
              
              try {
                // Send notification via Telegram
                const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
                const telegramResponse = await fetch(telegramUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: setting.chat_id,
                    text: message,
                  }),
                });
                
                const telegramData = await telegramResponse.json();
                
                if (telegramData.ok) {
                  logger.log(`Online notification sent successfully for ${name} to user ${setting.user_id}`);
                  // Update timestamp to prevent notification spam
                  lastNotificationTimestamps[notificationKey] = now;
                } else {
                  logger.error(`Failed to send online notification for ${name}:`, telegramData.description);
                }
              } catch (error) {
                logger.error(`Error sending online notification for ${name}:`, error);
              }
            }
          }
        }
      } catch (error) {
        logger.error('Error checking offline sensors:', error);
      }
      
      // Group settings by location
      const locationSettings = {};
      userSettings.forEach(setting => {
        locationSettings[setting.location] = {
          chat_id: setting.chat_id,
          enabled: !!setting.enabled,
          frequency: setting.notification_frequency_minutes || 30,
          notification_language: setting.notification_language || 'en',
          send_charts: setting.send_charts !== undefined ? !!setting.send_charts : true,
          temperature: {
            enabled: !!setting.temperature_enabled,
            min: setting.temperature_min,
            max: setting.temperature_max,
            threshold_type: setting.temperature_threshold_type || 'range'
          },
          humidity: {
            enabled: !!setting.humidity_enabled,
            min: setting.humidity_min,
            max: setting.humidity_max,
            threshold_type: setting.humidity_threshold_type || 'range'
          },
          pressure: {
            enabled: !!setting.pressure_enabled,
            min: setting.pressure_min,
            max: setting.pressure_max,
            threshold_type: setting.pressure_threshold_type || 'range'
          }
        };
      });
      
      // Check thresholds for each location
      const locations = Object.keys(locationSettings);
      logger.log(`Checking thresholds for ${locations.length} locations`);
      
      for (const location of locations) {
        const settings = locationSettings[location];
        if (!settings.enabled) continue;
        
        // Skip this location if all sensors are disabled
        if (!settings.temperature.enabled && !settings.humidity.enabled && !settings.pressure.enabled) {
          logger.log(`Skipping ${location}: all sensors are disabled`);
          continue;
        }
        
        // Check if enough time has passed since the last notification
        const now = Date.now();
        const lastNotified = lastNotificationTimestamps[location] || 0;
        const minutesSinceLastNotification = (now - lastNotified) / (60 * 1000);
        
        // Skip this location if we've sent a notification too recently
        if (minutesSinceLastNotification < settings.frequency) {
          logger.log(`Skipping ${location}: next notification available in ${Math.ceil(settings.frequency - minutesSinceLastNotification)} minutes`);
          continue;
        }
        
        // Query the latest data for this location from InfluxDB
        const query = `from(bucket: "${BUCKET}")
          |> range(start: -5m)
          |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}")
          |> filter(fn: (r) => r["_field"] == "teplota" or r["_field"] == "vlhkost" or r["_field"] == "tlak")
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
          logger.error(`Failed to fetch data for location ${location}:`, await response.text());
          continue;
        }
        
        const csvText = await response.text();
        const lines = csvText.split("\n").filter(line => line && !line.startsWith("#"));
        
        // Skip if no data
        if (lines.length <= 1) {
          logger.log(`No recent data for location ${location}`);
          continue;
        }
        
        // Parse the data
        const headers = lines[0].split(",").map(h => h.trim());
        const fieldIndex = headers.indexOf("_field");
        const valueIndex = headers.indexOf("_value");
        
        if (fieldIndex === -1 || valueIndex === -1) {
          logger.error(`Invalid CSV response for location ${location}`);
          continue;
        }
        
        // Extract temperature, humidity, and pressure values
        let temperature = null;
        let humidity = null;
        let pressure = null;
        
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(",");
          const field = row[fieldIndex];
          const value = parseFloat(row[valueIndex]);
          
          if (field === "teplota") temperature = value;
          else if (field === "vlhkost") humidity = value;
          else if (field === "tlak") pressure = value;
        }
        
        // Check if we have valid readings
        if (temperature === null && humidity === null && pressure === null) {
          logger.log(`No valid readings for location ${location}`);
          continue;
        }
        
        logger.log(`Readings for ${location}: temp=${temperature}°C, humidity=${humidity}%, pressure=${pressure} hPa`);
        
        // Check thresholds and send notifications if needed
        const messages = [];
        
        // Get the notification language
        const lang = settings.notification_language || 'en';
        
        if (temperature !== null && settings.temperature.enabled) {
          // Get the threshold type (range or max)
          const thresholdType = settings.temperature.threshold_type || 'range';
          
          if (thresholdType === 'range' && (temperature < settings.temperature.min || temperature > settings.temperature.max)) {
            // Range threshold type - notify when outside range
            if (lang === 'sk') {
              messages.push(`🌡️ Teplota je ${temperature}°C (mimo rozsah ${settings.temperature.min}°C - ${settings.temperature.max}°C) na ${location}`);
            } else {
              messages.push(`🌡️ Temperature is ${temperature}°C (outside range ${settings.temperature.min}°C - ${settings.temperature.max}°C) at ${location}`);
            }
          } else if (thresholdType === 'max' && temperature >= settings.temperature.max) {
            // Max threshold type - notify when threshold is reached
            if (lang === 'sk') {
              messages.push(`🌡️ Teplota dosiahla ${temperature}°C (prekročila cieľovú hodnotu ${settings.temperature.max}°C) na ${location}`);
            } else {
              messages.push(`🌡️ Temperature reached ${temperature}°C (exceeded target value ${settings.temperature.max}°C) at ${location}`);
            }
          }
        }
        
        if (humidity !== null && settings.humidity.enabled) {
          // Get the threshold type (range or max)
          const thresholdType = settings.humidity_threshold_type || 'range';
          
          if (thresholdType === 'range' && (humidity < settings.humidity.min || humidity > settings.humidity.max)) {
            // Range threshold type - notify when outside range
            if (lang === 'sk') {
              messages.push(`💧 Vlhkosť je ${humidity}% (mimo rozsah ${settings.humidity.min}% - ${settings.humidity.max}%) na ${location}`);
            } else {
              messages.push(`💧 Humidity is ${humidity}% (outside range ${settings.humidity.min}% - ${settings.humidity.max}%) at ${location}`);
            }
          } else if (thresholdType === 'max' && humidity >= settings.humidity.max) {
            // Max threshold type - notify when threshold is reached
            if (lang === 'sk') {
              messages.push(`💧 Vlhkosť dosiahla ${humidity}% (prekročila cieľovú hodnotu ${settings.humidity.max}%) na ${location}`);
            } else {
              messages.push(`💧 Humidity reached ${humidity}% (exceeded target value ${settings.humidity.max}%) at ${location}`);
            }
          }
        }
        
        if (pressure !== null && settings.pressure.enabled) {
          // Get the threshold type (range or max)
          const thresholdType = settings.pressure_threshold_type || 'range';
          
          if (thresholdType === 'range' && (pressure < settings.pressure.min || pressure > settings.pressure.max)) {
            // Range threshold type - notify when outside range
            if (lang === 'sk') {
              messages.push(`🧭 Tlak je ${pressure} hPa (mimo rozsah ${settings.pressure.min} hPa - ${settings.pressure.max} hPa) na ${location}`);
            } else {
              messages.push(`🧭 Pressure is ${pressure} hPa (outside range ${settings.pressure.min} hPa - ${settings.pressure.max} hPa) at ${location}`);
            }
          } else if (thresholdType === 'max' && pressure >= settings.pressure.max) {
            // Max threshold type - notify when threshold is reached
            if (lang === 'sk') {
              messages.push(`🧭 Tlak dosiahol ${pressure} hPa (prekročil cieľovú hodnotu ${settings.pressure.max} hPa) na ${location}`);
            } else {
              messages.push(`🧭 Pressure reached ${pressure} hPa (exceeded target value ${settings.pressure.max} hPa) at ${location}`);
            }
          }
        }
        
        if (messages.length > 0) {
          // Send notification
          try {
            const notificationText = messages.join('\n');
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            const telegramResponse = await fetch(telegramUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: settings.chat_id,
                text: notificationText,
              }),
            });
            
            const telegramData = await telegramResponse.json();
            
            if (telegramData.ok) {
              logger.log(`Notification sent successfully to ${location}`);
              
              // Update the last notification timestamp for this location
              lastNotificationTimestamps[location] = now;
              
              // Send charts for each type of sensor that triggered the notification
              const chartTypes = [];
              if (temperature !== null && settings.temperature.enabled) {
                const thresholdType = settings.temperature.threshold_type || 'range';
                if ((thresholdType === 'range' && (temperature < settings.temperature.min || temperature > settings.temperature.max)) ||
                    (thresholdType === 'max' && temperature >= settings.temperature.max)) {
                  chartTypes.push('temperature');
                }
              }
              
              if (humidity !== null && settings.humidity.enabled) {
                const thresholdType = settings.humidity.threshold_type || 'range';
                if ((thresholdType === 'range' && (humidity < settings.humidity.min || humidity > settings.humidity.max)) ||
                    (thresholdType === 'max' && humidity >= settings.humidity.max)) {
                  chartTypes.push('humidity');
                }
              }
              
              if (pressure !== null && settings.pressure.enabled) {
                const thresholdType = settings.pressure.threshold_type || 'range';
                if ((thresholdType === 'range' && (pressure < settings.pressure.min || pressure > settings.pressure.max)) ||
                    (thresholdType === 'max' && pressure >= settings.pressure.max)) {
                  chartTypes.push('pressure');
                }
              }
              
              // Send charts sequentially (if any threshold was exceeded)
              if (chartTypes.length > 0 && settings.send_charts) {
                const options = {
                  timeRangeMinutes: 60, // Show last hour of data
                  language: settings.notification_language || 'en'
                };
                
                try {
                  for (const chartType of chartTypes) {
                    await telegramChart.sendSensorChart(
                      settings.chat_id,
                      location,
                      chartType,
                      options
                    );
                  }
                  logger.log(`Charts sent successfully for ${location}`);
                } catch (error) {
                  logger.error(`Error sending charts for ${location}:`, error);
                }
              } else if (chartTypes.length > 0) {
                // Charts are disabled but thresholds were exceeded
                logger.log(`Charts are disabled for ${location}, skipping chart generation`);
              }
            } else {
              logger.error(`Failed to send notification to ${location}:`, telegramData.description);
            }
          } catch (error) {
            logger.error(`Error sending notification for ${location}:`, error);
          }
        } else {
          logger.log(`No thresholds exceeded for ${location}`);
        }
      }
    } catch (error) {
      logger.error('Error checking notification settings in database:', error);
    }
  } catch (error) {
    logger.error('Error checking sensor thresholds:', error);
  }
}

// Set up a periodic check for threshold monitoring - check every minute but respect each user's frequency setting
const MONITORING_INTERVAL_MINUTES = 1;
setInterval(checkSensorThresholds, MONITORING_INTERVAL_MINUTES * 60 * 1000);

// Comment out the initial check to avoid duplicate notifications
// setTimeout(checkSensorThresholds, 60 * 1000);

// Add catch-all handler at the end, after all routes are defined
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

// Function to check sensor data against thresholds and send notifications
// This function is likely causing duplicate notifications, so it's commented out for now
/*
async function checkSensorDataAgainstThresholds(sensorData) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return;
    }

    // Get all notification settings from the database
    const allSettings = await notificationSettings.getAllSettings();
    
    // Group settings by user for better organization
    const settingsByUser = {};
    allSettings.forEach(setting => {
      if (!settingsByUser[setting.user_id]) {
        settingsByUser[setting.user_id] = {
          chat_id: setting.chat_id,
          locations: {}
        };
      }
      
      settingsByUser[setting.user_id].locations[setting.location] = {
        temperature: {
          min: setting.temperature_min,
          max: setting.temperature_max,
          enabled: !!setting.temperature_enabled
        },
        humidity: {
          min: setting.humidity_min,
          max: setting.humidity_max,
          enabled: !!setting.humidity_enabled
        },
        pressure: {
          min: setting.pressure_min,
          max: setting.pressure_max,
          enabled: !!setting.pressure_enabled
        },
        enabled: !!setting.enabled
      };
    });
    
    // Process data for each user
    for (const [userId, userData] of Object.entries(settingsByUser)) {
      const { chat_id: chatId, locations } = userData;
      
      // Skip users with no chat ID
      if (!chatId) continue;
      
      // Process data for each location that has settings
      for (const [location, thresholds] of Object.entries(locations)) {
        // Skip if notifications for this location are disabled
        if (!thresholds.enabled) continue;
        
        // Skip this location if all sensors are disabled
        if (!thresholds.temperature.enabled && !thresholds.humidity.enabled && !thresholds.pressure.enabled) {
          logger.log(`Skipping ${location} for user ${userId}: all sensors are disabled`);
          continue;
        }
        
        // Skip if sensor data doesn't match this location
        if (!sensorData[location]) continue;
        
        // Check for threshold violations
        const alerts = [];
        
        // Temperature check
        if (thresholds.temperature.enabled && sensorData[location].temperature !== undefined) {
          const temp = sensorData[location].temperature;
          if (temp < thresholds.temperature.min || temp > thresholds.temperature.max) {
            alerts.push(`🌡️ Temperature at ${location} is ${temp}°C (outside range ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C)`);
          }
        }
        
        // Humidity check
        if (thresholds.humidity.enabled && sensorData[location].humidity !== undefined) {
          const humidity = sensorData[location].humidity;
          if (humidity < thresholds.humidity.min || humidity > thresholds.humidity.max) {
            alerts.push(`💧 Humidity at ${location} is ${humidity}% (outside range ${thresholds.humidity.min}% - ${thresholds.humidity.max}%)`);
          }
        }
        
        // Pressure check
        if (thresholds.pressure.enabled && sensorData[location].pressure !== undefined) {
          const pressure = sensorData[location].pressure;
          if (pressure < thresholds.pressure.min || pressure > thresholds.pressure.max) {
            alerts.push(`🧭 Pressure at ${location} is ${pressure} hPa (outside range ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa)`);
          }
        }
        
        // Send notifications if there are any alerts
        if (alerts.length > 0) {
          const message = `📊 Pi-Temp Dashboard Alert:\n\n${alerts.join('\n\n')}`;
          
          try {
            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: message,
                }),
              }
            );
            logger.log(`Sent notification to user ${userId} for location ${location}`);
          } catch (error) {
            logger.error(`Failed to send notification to user ${userId}: ${error.message}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error in checkSensorDataAgainstThresholds:', error);
  }
}
*/

// API endpoint to save notification settings
app.post('/api/telegram/settings', ensureAuthenticated, async (req, res) => {
  try {
    const { 
      chat_id, 
      enabled, 
      location,
      temperature_enabled, 
      temperature_min, 
      temperature_max,
      temperature_threshold_type,
      humidity_enabled, 
      humidity_min, 
      humidity_max,
      humidity_threshold_type,
      pressure_enabled, 
      pressure_min, 
      pressure_max,
      pressure_threshold_type,
      offline_notification_enabled,
      notification_frequency_minutes,
      notification_language,
      send_charts
    } = req.body;

    // Validate required parameters
    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    const userId = req.user.id;

    // Save settings to the database
    await db.notificationSettings.save({
      user_id: userId,
      chat_id,
      enabled: enabled === true ? 1 : 0,
      location,
      temperature_enabled: temperature_enabled === true ? 1 : 0,
      temperature_min,
      temperature_max,
      temperature_threshold_type,
      humidity_enabled: humidity_enabled === true ? 1 : 0,
      humidity_min,
      humidity_max,
      humidity_threshold_type,
      pressure_enabled: pressure_enabled === true ? 1 : 0,
      pressure_min,
      pressure_max,
      pressure_threshold_type,
      offline_notification_enabled: offline_notification_enabled === true ? 1 : 0,
      notification_frequency_minutes: parseInt(notification_frequency_minutes, 10) || 30,
      notification_language: notification_language || 'en',
      send_charts: send_charts === true ? 1 : 0
    });

    // Clear the notification timestamp when settings are updated
    delete notificationTimestamps[`${userId}-${location}`];

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Failed to save notification settings: ' + error.message);
    res.status(500).json({ error: 'Failed to save notification settings' });
  }
});

// Send a sensor chart via Telegram
app.post('/api/telegram/chart', ensureAuthenticated, async (req, res) => {
  try {
    const { location, type, timeRangeMinutes, language } = req.body;

    if (!location || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: location and type'
      });
    }

    // Validate type
    const validTypes = ['temperature', 'humidity', 'pressure'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : 1; // Fall back to user ID 1 in dev mode
    
    // Get notification settings for this user to get the chat ID
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram settings not found'
      });
    }
    
    // Get the chat ID from the first setting (all settings should have the same chat ID)
    const chatId = userSettings[0].chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    // Check if Telegram bot token is configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Set options for chart generation
    const options = {
      timeRangeMinutes: timeRangeMinutes || 60,
      language: language || userSettings[0].notification_language || 'en'
    };

    // Generate and send chart
    const result = await telegramChart.sendSensorChart(chatId, location, type, options);

    return res.status(200).json({
      success: true,
      message: `Chart sent successfully for ${location} - ${type}`,
      telegram: result
    });
  } catch (error) {
    logger.error('Error sending chart via Telegram:', error);
    res.status(500).json({
      success: false,
      message: `Error sending chart: ${error.message}`
    });
  }
});

// New endpoint to include charts with threshold notifications
app.post('/api/telegram/notify-with-chart', ensureAuthenticated, async (req, res) => {
  try {
    const { location, temperature, humidity, pressure, thresholds, notificationLanguage = 'en' } = req.body;

    if (!location || !thresholds || temperature === undefined || humidity === undefined || pressure === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : 1; // Fall back to user ID 1 in dev mode
    
    // Get notification settings for this user
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }
    
    // Get the chat ID from the first setting (all settings should have the same chat ID)
    const chatId = userSettings[0].chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Get preferred notification language (fallback to English)
    const lang = notificationLanguage || userSettings[0].notification_language || 'en';

    // Format the notification text based on language
    const messages = [];
    let chartTypes = [];
    
    if (temperature !== undefined && thresholds.temperature?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.temperature.thresholdType || 'range';
      
      if (thresholdType === 'range' && (temperature < thresholds.temperature.min || temperature > thresholds.temperature.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota je ${temperature}°C (mimo rozsah ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature is ${temperature}°C (outside range ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) at ${location}`);
        }
        chartTypes.push('temperature');
      } else if (thresholdType === 'max' && temperature >= thresholds.temperature.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota dosiahla ${temperature}°C (prekročila cieľovú hodnotu ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature reached ${temperature}°C (exceeded target value ${thresholds.temperature.max}°C) at ${location}`);
        }
        chartTypes.push('temperature');
      }
    }
    
    if (humidity !== undefined && thresholds.humidity?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.humidity.thresholdType || 'range';
      
      if (thresholdType === 'range' && (humidity < thresholds.humidity.min || humidity > thresholds.humidity.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť je ${humidity}% (mimo rozsah ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity is ${humidity}% (outside range ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) at ${location}`);
        }
        chartTypes.push('humidity');
      } else if (thresholdType === 'max' && humidity >= thresholds.humidity.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť dosiahla ${humidity}% (prekročila cieľovú hodnotu ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity reached ${humidity}% (exceeded target value ${thresholds.humidity.max}%) at ${location}`);
        }
        chartTypes.push('humidity');
      }
    }
    
    if (pressure !== undefined && thresholds.pressure?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.pressure.thresholdType || 'range';
      
      if (thresholdType === 'range' && (pressure < thresholds.pressure.min || pressure > thresholds.pressure.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🧭 Tlak je ${pressure} hPa (mimo rozsah ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure is ${pressure} hPa (outside range ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) at ${location}`);
        }
        chartTypes.push('pressure');
      } else if (thresholdType === 'max' && pressure >= thresholds.pressure.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🧭 Tlak dosiahol ${pressure} hPa (prekročil cieľovú hodnotu ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure reached ${pressure} hPa (exceeded target value ${thresholds.pressure.max} hPa) at ${location}`);
        }
        chartTypes.push('pressure');
      }
    }
    
    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: lang === 'sk' ? 'Neboli zistené žiadne porušenia limitov ani dosiahnuté cieľové hodnoty' : 'No threshold violations or target values detected'
      });
    }
    
    const text = messages.join('\n');
    
    // Send the notification text
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(500).json({
        success: false,
        message: lang === 'sk' 
          ? `Nepodarilo sa odoslať upozornenie: ${data.description}` 
          : `Failed to send notification: ${data.description}`
      });
    }
    
    // Send charts for each affected sensor type
    const chartResults = [];
    const options = {
      timeRangeMinutes: 60, // Show last hour
      language: lang
    };
    
    try {
      // Send charts sequentially to avoid race conditions
      for (const chartType of chartTypes) {
        const chartResult = await telegramChart.sendSensorChart(
          chatId, 
          location, 
          chartType, 
          options
        );
        chartResults.push(chartResult);
      }
    } catch (chartError) {
      logger.error('Error sending charts:', chartError);
      // We'll still return success since the text notification was sent
    }
    
    return res.status(200).json({ 
      success: true, 
      message: lang === 'sk' ? 'Upozornenie úspešne odoslané' : 'Notification sent successfully',
      telegram: data,
      charts: chartResults
    });
  } catch (error) {
    logger.error('Error sending Telegram notification with charts:', error);
    const errorLang = req.body?.notificationLanguage || 'en';
    res.status(500).json({
      success: false,
      message: errorLang === 'sk' 
        ? `Chyba servera pri odosielaní upozornenia: ${error.message}` 
        : `Server error while sending notification: ${error.message}`
    });
  }
});