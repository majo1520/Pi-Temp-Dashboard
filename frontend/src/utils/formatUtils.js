/**
 * Format duration in human-readable format (days, hours, minutes)
 * 
 * @param {number} ms - Duration in milliseconds
 * @returns {string|null} Formatted duration string or null if no duration provided
 */
export function formatDuration(ms) {
  if (!ms) return null;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Format time since in a human readable format
 * 
 * @param {number} ms - Milliseconds since event
 * @returns {string} Human readable time
 */
export function formatTimeSince(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return `${seconds}s ago`;
  }
}

/**
 * Format a timestamp to a human-readable string
 * 
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} Formatted date time string
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return "–";
  
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return "Invalid date";
  }
} 