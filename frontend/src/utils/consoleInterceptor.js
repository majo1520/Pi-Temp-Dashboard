/**
 * Console Interceptor
 * 
 * This utility intercepts console methods and controls their behavior based on 
 * environment settings. In production or when logs are disabled, certain console 
 * outputs can be suppressed.
 */
import { isLogsEnabled, shouldShowLogType, shouldSuppressAuthErrors } from './toggleLogs';

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
  trace: console.trace
};

// Patterns that indicate authentication errors (to be filtered in some environments)
const AUTH_ERROR_PATTERNS = ['401', 'Unauthorized', 'Authentication', 'auth error'];

/**
 * Check if the console arguments contain authentication error patterns
 * @param {Array} args - Console arguments
 * @returns {boolean} - True if args contain auth error patterns
 */
const isAuthError = (args) => {
  if (!args || args.length === 0) return false;
  
  const stringArgs = args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message;
    if (typeof arg === 'object') return JSON.stringify(arg);
    return String(arg);
  }).join(' ');
  
  return AUTH_ERROR_PATTERNS.some(pattern => 
    stringArgs.toLowerCase().includes(pattern.toLowerCase())
  );
};

/**
 * Create a wrapped console method that can be controlled based on config
 * @param {string} methodName - Name of the console method
 * @param {Function} originalMethod - Original console method
 * @returns {Function} - Wrapped console method
 */
const createWrappedMethod = (methodName, originalMethod) => {
  return function(...args) {
    // Skip authentication errors when they should be suppressed
    if (shouldSuppressAuthErrors() && isAuthError(args)) {
      return;
    }
    
    // Use the shouldShowLogType function to determine if this log type should be shown
    if (!shouldShowLogType(methodName)) {
      return;
    }
    
    // Call the original method with all arguments
    return originalMethod.apply(console, args);
  };
};

/**
 * Initialize the console interceptor
 */
export const initConsoleInterceptor = () => {
  // Replace each console method with our wrapped version
  Object.keys(originalConsole).forEach(method => {
    console[method] = createWrappedMethod(method, originalConsole[method]);
  });
};

/**
 * Restore original console methods
 */
export const restoreConsole = () => {
  Object.keys(originalConsole).forEach(method => {
    console[method] = originalConsole[method];
  });
};

export default {
  initConsoleInterceptor,
  restoreConsole
}; 