/**
 * Simple Logger Utility
 * 
 * This module provides a simple logging utility for consistent logging
 * throughout the application.
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// Set default log level based on environment
const DEFAULT_LOG_LEVEL = process.env.NODE_ENV === 'production' 
  ? LOG_LEVELS.ERROR 
  : LOG_LEVELS.DEBUG;

// Configure current log level
let currentLogLevel = process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL;

// Log level precedence
const LOG_LEVEL_PRECEDENCE = {
  [LOG_LEVELS.ERROR]: 0,
  [LOG_LEVELS.WARN]: 1,
  [LOG_LEVELS.INFO]: 2,
  [LOG_LEVELS.DEBUG]: 3
};

/**
 * Check if the given level should be logged based on current log level
 * @param {string} level - The log level to check
 * @returns {boolean} - Whether the level should be logged
 */
function shouldLog(level) {
  return LOG_LEVEL_PRECEDENCE[level] <= LOG_LEVEL_PRECEDENCE[currentLogLevel];
}

/**
 * Format the log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} - Formatted log message
 */
function formatLogMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Log a message at the ERROR level
 * @param {string} message - The message to log
 * @param {*} [error] - Optional error object
 */
function error(message, error) {
  if (!shouldLog(LOG_LEVELS.ERROR)) return;
  
  console.error(formatLogMessage(LOG_LEVELS.ERROR, message));
  if (error) {
    console.error(error);
  }
}

/**
 * Log a message at the WARN level
 * @param {string} message - The message to log
 * @param {*} [data] - Optional additional data
 */
function warn(message, data) {
  if (!shouldLog(LOG_LEVELS.WARN)) return;
  
  console.warn(formatLogMessage(LOG_LEVELS.WARN, message));
  if (data) {
    console.warn(data);
  }
}

/**
 * Log a message at the INFO level
 * @param {string} message - The message to log
 * @param {*} [data] - Optional additional data
 */
function info(message, data) {
  if (!shouldLog(LOG_LEVELS.INFO)) return;
  
  console.info(formatLogMessage(LOG_LEVELS.INFO, message));
  if (data) {
    console.info(data);
  }
}

/**
 * Log a message at the DEBUG level
 * @param {string} message - The message to log
 * @param {*} [data] - Optional additional data
 */
function debug(message, data) {
  if (!shouldLog(LOG_LEVELS.DEBUG)) return;
  
  console.debug(formatLogMessage(LOG_LEVELS.DEBUG, message));
  if (data) {
    console.debug(data);
  }
}

/**
 * Set the current log level
 * @param {string} level - The log level to set
 */
function setLogLevel(level) {
  if (LOG_LEVELS[level]) {
    currentLogLevel = LOG_LEVELS[level];
    info(`Log level set to ${currentLogLevel}`);
  } else {
    warn(`Invalid log level: ${level}. Using ${currentLogLevel}`);
  }
}

/**
 * General purpose log function that accepts a level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {*} [data] - Optional additional data
 */
function log(level, message, data) {
  switch (level.toUpperCase()) {
    case LOG_LEVELS.ERROR:
      error(message, data);
      break;
    case LOG_LEVELS.WARN:
      warn(message, data);
      break;
    case LOG_LEVELS.INFO:
      info(message, data);
      break;
    case LOG_LEVELS.DEBUG:
      debug(message, data);
      break;
    default:
      info(message, data);
  }
}

module.exports = {
  error,
  warn,
  info,
  debug,
  log,
  setLogLevel,
  LOG_LEVELS
}; 