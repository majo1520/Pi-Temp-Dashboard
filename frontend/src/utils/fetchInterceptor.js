/**
 * Fetch API interceptor to suppress 401 errors in the browser console
 * This intercepts the native fetch API and prevents 401 errors from being logged
 * when VITE_SUPPRESS_AUTH_ERRORS is enabled
 */
import { shouldSuppressAuthErrors } from './toggleLogs';

// Store the original fetch function
const originalFetch = window.fetch;

/**
 * Custom fetch that can suppress 401 error logging
 * @param {string|Request} resource - The resource to fetch
 * @param {Object} options - The options for the fetch request
 * @returns {Promise<Response>} The fetch response
 */
const customFetch = function(resource, options = {}) {
  const suppressAuthErrors = shouldSuppressAuthErrors();
  
  // If we're not suppressing auth errors, just use the original fetch
  if (!suppressAuthErrors) {
    return originalFetch(resource, options);
  }
  
  // Otherwise, use a custom fetch that suppresses 401 errors in DevTools
  return originalFetch(resource, options)
    .then(response => {
      // For 401 responses, create a clone to prevent console logging
      // but still return the original response for the application to handle
      if (response.status === 401) {
        // Clone the response to prevent it from being logged
        const clonedResponse = response.clone();
        
        // Consume the original response to prevent it from being logged
        response.text().catch(() => {});
        
        return clonedResponse;
      }
      
      return response;
    })
    .catch(error => {
      // Only re-throw non-auth errors or when suppression is disabled
      if (!error.message?.includes('401')) {
        throw error;
      }
      
      // Return a fake 401 response for auth errors
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    });
};

/**
 * Initialize the fetch interceptor
 */
export function initFetchInterceptor() {
  if (typeof window !== 'undefined') {
    window.fetch = customFetch;
    
    // Also intercept XMLHttpRequest to suppress 401 errors
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(...args) {
      // Store the request information for later
      this._requestMethod = args[0];
      this._requestUrl = args[1];
      originalXHROpen.apply(this, args);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
      if (shouldSuppressAuthErrors()) {
        // Add event listener to suppress 401 errors
        this.addEventListener('readystatechange', function() {
          if (this.readyState === 4 && this.status === 401) {
            // Suppress output in the console for this request
            console.groupCollapsed(`XHR ${this._requestMethod} ${this._requestUrl} (401 suppressed)`);
            console.groupEnd();
          }
        });
      }
      
      originalXHRSend.apply(this, args);
    };
  }
}

export default {
  initFetchInterceptor
}; 