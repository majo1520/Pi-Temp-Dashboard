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
 * Check if logs are currently enabled
 * @example Run in browser console: window.isLogsEnabled()
 * @returns {boolean} Whether logs are enabled
 */
export function isLogsEnabled() {
  const envSetting = import.meta.env.VITE_DISABLE_LOGS;
  const localStorageSetting = localStorage.getItem('logsEnabled');
  
  // Environment variable has highest priority
  if (envSetting === 'true') return false;
  if (envSetting === 'false') return true;
  
  // Next check localStorage
  if (localStorageSetting === 'true') return true;
  if (localStorageSetting === 'false') return false;
  
  // Default based on environment
  return process.env.NODE_ENV === 'development';
}

// Expose these functions to the window object so they can be called from the console
if (typeof window !== 'undefined') {
  window.enableLogs = enableLogs;
  window.disableLogs = disableLogs;
  window.isLogsEnabled = isLogsEnabled;
}

export default {
  enableLogs,
  disableLogs,
  isLogsEnabled
}; 