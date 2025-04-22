/**
 * Utility functions to toggle console logging in the application
 * Users can run these from the browser console to enable or disable logs
 */

/**
 * Enable all console logs in the application
 * @example Run in browser console: window.enableLogs()
 */
export function enableLogs() {
  localStorage.setItem('logsEnabled', 'true');
  console.log('✅ Console logs enabled. Refresh the page to apply changes.');
  return true;
}

/**
 * Disable all console logs in the application
 * @example Run in browser console: window.disableLogs()
 */
export function disableLogs() {
  localStorage.setItem('logsEnabled', 'false');
  console.log('🔇 Console logs disabled. Refresh the page to apply changes.');
  return true;
}

/**
 * Normalize log level from multiple formats to a standard format
 * Handles both backend (ALL, ERROR, NONE) and frontend formats
 * @param {string} level - The log level to normalize
 * @returns {string} - The normalized log level
 */
function normalizeLogLevel(level) {
  if (!level) return null;
  
  // Convert to uppercase for comparison
  const uppercaseLevel = level.toUpperCase();
  
  // Map backend-style log levels to frontend-style
  if (uppercaseLevel === 'ALL') return 'ALL';
  if (uppercaseLevel === 'ERROR') return 'ERRORS_ONLY';
  if (uppercaseLevel === 'NONE') return 'NONE';
  
  // Return the original value if it's already in our format
  if (['ALL', 'ERRORS_ONLY', 'NONE'].includes(uppercaseLevel)) {
    return uppercaseLevel;
  }
  
  return null;
}

/**
 * Check if logs are currently enabled
 * @example Run in browser console: window.isLogsEnabled()
 * @returns {boolean} Whether logs are enabled
 */
export function isLogsEnabled() {
  // Check environment variables first (highest priority)
  const envLogLevel = normalizeLogLevel(import.meta.env.VITE_CONSOLE_LOG_LEVEL);
  if (envLogLevel === 'NONE') return false;
  if (envLogLevel === 'ALL') return true;
  
  // Also check for backend-style env var (compatibility)
  const backendLogLevel = normalizeLogLevel(import.meta.env.VITE_LOGGING_LEVEL);
  if (backendLogLevel === 'NONE') return false;
  if (backendLogLevel === 'ALL') return true;
  
  // Legacy env setting
  const legacyEnvSetting = import.meta.env.VITE_DISABLE_LOGS;
  if (legacyEnvSetting === 'true') return false;
  if (legacyEnvSetting === 'false') return true;
  
  // Next check localStorage
  const localStorageSetting = localStorage.getItem('logsEnabled');
  if (localStorageSetting === 'true') return true;
  if (localStorageSetting === 'false') return false;
  
  // Default based on environment
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if a specific type of log should be shown
 * @param {string} logType - The type of log ('log', 'error', 'warn', etc.)
 * @returns {boolean} Whether this log type should be shown
 */
export function shouldShowLogType(logType) {
  // If logs are completely disabled, return false for all types
  if (!isLogsEnabled()) {
    return false;
  }
  
  // Normalize the environment log level
  const envLogLevel = normalizeLogLevel(import.meta.env.VITE_CONSOLE_LOG_LEVEL) || 
                       normalizeLogLevel(import.meta.env.VITE_LOGGING_LEVEL);
  
  // If set to ALL, show everything
  if (envLogLevel === 'ALL') {
    return true;
  }
  
  // If set to ERRORS_ONLY, only show errors and warnings
  if (envLogLevel === 'ERRORS_ONLY') {
    return ['error', 'warn'].includes(logType);
  }
  
  // If set to NONE, show nothing
  if (envLogLevel === 'NONE') {
    return false;
  }
  
  // Default behavior: in production show only errors, in development show all
  if (process.env.NODE_ENV === 'production') {
    return ['error', 'warn'].includes(logType);
  }
  
  return true;
}

/**
 * Check if authentication errors (401) should be suppressed
 * @returns {boolean} Whether auth errors should be suppressed
 */
export function shouldSuppressAuthErrors() {
  return import.meta.env.VITE_SUPPRESS_AUTH_ERRORS === 'true';
}

// Expose these functions to the window object so they can be called from the console
if (typeof window !== 'undefined') {
  window.enableLogs = enableLogs;
  window.disableLogs = disableLogs;
  window.isLogsEnabled = isLogsEnabled;
  window.shouldShowLogType = shouldShowLogType;
  window.shouldSuppressAuthErrors = shouldSuppressAuthErrors;
}

export default {
  enableLogs,
  disableLogs,
  isLogsEnabled,
  shouldShowLogType,
  shouldSuppressAuthErrors
}; 