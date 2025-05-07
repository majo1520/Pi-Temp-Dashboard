/**
 * Utility functions for formatting data in the dashboard
 */

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted size string (e.g., "1.5 MB")
 */
export const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || isNaN(bytes)) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Format seconds to human-readable duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string (e.g., "2d 5h 30m")
 */
export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return 'N/A';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

/**
 * Format time difference in a readable format
 * @param {number} ms - Time difference in milliseconds
 * @returns {string} Formatted time string (e.g., "5m ago")
 */
export const formatTimeDiff = (ms) => {
  if (!ms || isNaN(ms) || ms === Infinity) return "never";
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Format a number to have a specific precision
 * @param {number} value - Number to format
 * @param {number} precision - Number of decimal places
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, precision = 2) => {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  return Number(value).toFixed(precision);
};

/**
 * Get appropriate color class based on utilization percentage
 * @param {number} percent - Utilization percentage
 * @returns {string} Tailwind CSS color class
 */
export const getUtilizationColorClass = (percent) => {
  if (percent > 90) return 'bg-red-500';
  if (percent > 70) return 'bg-yellow-500';
  return 'bg-green-500';
}; 