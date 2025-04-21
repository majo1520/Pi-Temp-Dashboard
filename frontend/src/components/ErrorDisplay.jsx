import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Component to display errors from our error handler
 * @param {Object} props Component props
 * @param {Object} props.errors Errors object from useErrorHandler
 * @param {Function} props.clearErrors Function to clear errors
 * @returns {JSX.Element|null} Error display component or null if no errors
 */
function ErrorDisplay({ errors, clearErrors }) {
  const { t } = useTranslation();
  
  // Exit early if no errors
  if (!errors || Object.keys(errors).filter(key => errors[key]).length === 0) {
    return null;
  }

  // Get active errors
  const activeErrors = Object.entries(errors)
    .filter(([_, value]) => value !== null)
    .map(([key, error]) => ({ context: key, ...error }));

  if (activeErrors.length === 0) {
    return null;
  }
  
  // Function to translate error messages if they match translation keys
  const translateErrorMessage = (message) => {
    // Check if message is a translation key
    if (message === 'customRangeError') {
      return t('customRangeError');
    }
    if (message === 'customRangeInvalidDates') {
      return t('customRangeInvalidDates');
    }
    
    // Otherwise return the original message
    return message;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-full">
      {activeErrors.map((error, index) => (
        <div 
          key={`${error.context}-${index}`}
          className="bg-red-50 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 mb-2 rounded shadow-lg"
          role="alert"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold">Error in {error.context}</div>
              <p>{translateErrorMessage(error.message)}</p>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {new Date(error.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <button 
              onClick={() => clearErrors(error.context)}
              className="ml-4 text-red-500 hover:text-red-700 dark:text-red-300 dark:hover:text-red-100"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
      
      {activeErrors.length > 1 && (
        <button
          onClick={() => clearErrors()}
          className="w-full bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 p-2 rounded shadow-lg text-center hover:bg-red-200 dark:hover:bg-red-700"
        >
          {t('clearAllErrors') || 'Clear All Errors'}
        </button>
      )}
    </div>
  );
}

export default ErrorDisplay; 