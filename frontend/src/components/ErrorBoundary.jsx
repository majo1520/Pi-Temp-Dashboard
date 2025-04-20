import React, { Component } from 'react';

/**
 * Error boundary component to catch and handle errors in child components
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
    
    // You could also log to an error reporting service
    // Example: logErrorToService(error, errorInfo);
  }

  render() {
    const { hasError, error, errorInfo } = this.state;
    
    if (hasError) {
      // Custom fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="max-w-lg w-full p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4 text-red-600 dark:text-red-400">
                Oops! Something went wrong
              </h2>
              <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-left overflow-auto">
                <p className="text-sm font-mono mb-2">{error?.toString()}</p>
                {errorInfo && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold mb-1">Stack trace</summary>
                    <pre className="whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                  </details>
                )}
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
                <button
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                >
                  Try to Recover
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // If no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary; 