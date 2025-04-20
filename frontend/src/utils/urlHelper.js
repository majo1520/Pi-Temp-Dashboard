/**
 * URL Helper utility to ensure consistent protocol usage
 * This helps prevent mixed content errors when the app is accessed via HTTP
 */

// Get the environment setting for protocol forcing
const forceHttp = import.meta.env.VITE_FORCE_HTTP === 'true';

/**
 * Ensures a URL uses the correct protocol based on environment settings
 * @param {string} url - The URL to ensure has the correct protocol
 * @returns {string} - URL with the correct protocol
 */
export const ensureCorrectProtocol = (url) => {
  if (!url) return url;
  
  // If we're forcing HTTP and the URL is using HTTPS, convert it
  if (forceHttp && url.startsWith('https://')) {
    return url.replace('https://', 'http://');
  }
  
  // If the URL is a relative URL without protocol, return as is
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url;
  }
  
  return url;
};

/**
 * Builds an asset URL ensuring it uses the correct protocol
 * @param {string} assetPath - Path to the asset
 * @returns {string} - Full asset URL with correct protocol
 */
export const getAssetUrl = (assetPath) => {
  // Remove leading slash if present
  const path = assetPath.startsWith('/') ? assetPath.substring(1) : assetPath;
  
  // Get the base URL from the current page
  const baseUrl = window.location.origin;
  
  // Combine and ensure correct protocol
  return ensureCorrectProtocol(`${baseUrl}/${path}`);
};

/**
 * Creates an API URL with the correct base and protocol
 * @param {string} endpoint - API endpoint path
 * @returns {string} - Full API URL
 */
export const getApiUrl = (endpoint) => {
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const path = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // If API base is a full URL
  if (apiBase.startsWith('http')) {
    return ensureCorrectProtocol(`${apiBase}/${path}`);
  }
  
  // If API base is a relative path
  const baseUrl = window.location.origin;
  return ensureCorrectProtocol(`${baseUrl}${apiBase.startsWith('/') ? '' : '/'}${apiBase}/${path}`);
};

export default {
  ensureCorrectProtocol,
  getAssetUrl,
  getApiUrl
}; 