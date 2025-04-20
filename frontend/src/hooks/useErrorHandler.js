import { useState, useCallback } from 'react';

/**
 * Custom hook for handling errors consistently across the application
 * @returns {Object} Error handling utilities
 */
function useErrorHandler() {
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState({});

  /**
   * Handles API fetch errors consistently
   * @param {Error} error - The error object
   * @param {string} context - Context where the error occurred
   * @param {Function} onError - Optional callback for additional error handling
   */
  const handleError = useCallback((error, context, onError) => {
    console.error(`Error in ${context}:`, error);
    setErrors(prev => ({
      ...prev,
      [context]: {
        message: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        details: error.stack
      }
    }));
    
    if (onError && typeof onError === 'function') {
      onError(error);
    }
  }, []);

  /**
   * Wraps an async function with error handling and loading state
   * @param {Function} asyncFn - The async function to wrap
   * @param {string} context - Context identifier for error tracking
   * @param {Function} onError - Optional callback for error handling
   * @returns {Function} Wrapped function with error handling
   */
  const withErrorHandling = useCallback((asyncFn, context, onError) => {
    return async (...args) => {
      setIsLoading(prev => ({ ...prev, [context]: true }));
      try {
        const result = await asyncFn(...args);
        setErrors(prev => ({ ...prev, [context]: null }));
        return result;
      } catch (error) {
        handleError(error, context, onError);
        throw error;
      } finally {
        setIsLoading(prev => ({ ...prev, [context]: false }));
      }
    };
  }, [handleError]);

  /**
   * Clears errors for a specific context or all contexts
   * @param {string} [context] - Optional context to clear errors for. If omitted, clears all errors.
   */
  const clearErrors = useCallback((context) => {
    if (context) {
      setErrors(prev => ({ ...prev, [context]: null }));
    } else {
      setErrors({});
    }
  }, []);

  return {
    errors,
    isLoading,
    handleError,
    withErrorHandling,
    clearErrors
  };
}

export default useErrorHandler; 