// config.js
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Determine if we're in production mode
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, '..', '.env.production'));
if (isProduction && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Load .env file from backend directory
dotenv.config({ path: path.join(__dirname, '..', isProduction ? '.env.production' : '.env') });

// Configure InfluxDB connection
const INFLUX_URL = process.env.VITE_INFLUX_URL || process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.VITE_INFLUX_TOKEN || process.env.INFLUX_TOKEN || 'testtoken';
const ORG = process.env.VITE_ORG || process.env.ORG || 'testorg';
const BUCKET = process.env.VITE_BUCKET || process.env.BUCKET || 'testbucket';
const VISIBILITY_FILE = path.join(__dirname, '..', 'visibility.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_insecure_secret';
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 3600000; // 1 hour default
const ENABLE_RATE_LIMITING = process.env.ENABLE_RATE_LIMITING === 'true';
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW) || 15;
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ? 
  process.env.CORS_ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:5173', 'http://192.168.155.206:5000', 'http://192.168.155.206'];
const LOGGING_LEVEL = (process.env.LOGGING_LEVEL || 'ALL').toUpperCase(); // Logging level: ALL, ERROR, NONE
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// Telegram notification configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_NOTIFICATIONS_ENABLED = process.env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true';
const TELEGRAM_DEV_MODE = process.env.TELEGRAM_DEV_MODE === 'true';

// Ensure environment variables are set for telegram-chart.cjs which uses different variable names
process.env.INFLUX_URL = INFLUX_URL;
process.env.INFLUX_TOKEN = INFLUX_TOKEN;
process.env.INFLUX_ORG = ORG;
process.env.INFLUX_BUCKET = BUCKET;

module.exports = {
  isProduction,
  INFLUX_URL,
  INFLUX_TOKEN,
  ORG,
  BUCKET,
  VISIBILITY_FILE,
  SESSION_SECRET,
  SESSION_MAX_AGE,
  ENABLE_RATE_LIMITING,
  RATE_LIMIT_WINDOW,
  RATE_LIMIT_MAX_REQUESTS,
  CORS_ALLOWED_ORIGINS,
  LOGGING_LEVEL,
  ADMIN_PASSWORD_HASH,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_NOTIFICATIONS_ENABLED,
  TELEGRAM_DEV_MODE
}; 