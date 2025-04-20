import React, { memo } from 'react';

/**
 * LoadingIndicator component displays a spinner or loading message
 * Used as fallback for lazy-loaded components
 */
const LoadingIndicator = ({ text = "Loading...", size = "medium" }) => {
  // Size values in pixels
  const sizes = {
    small: { spinner: 24, text: 14 },
    medium: { spinner: 36, text: 16 },
    large: { spinner: 48, text: 18 },
  };
  
  const sizeValues = sizes[size] || sizes.medium;
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      height: '100%',
      width: '100%',
      minHeight: '200px',
    }}>
      <div style={{
        border: `${sizeValues.spinner/8}px solid #f3f3f3`,
        borderTop: `${sizeValues.spinner/8}px solid #3498db`,
        borderRadius: '50%',
        width: `${sizeValues.spinner}px`,
        height: `${sizeValues.spinner}px`,
        animation: 'spin 1s linear infinite',
      }} />
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      {text && (
        <div style={{
          marginTop: '10px',
          fontSize: `${sizeValues.text}px`,
          color: '#666',
        }}>
          {text}
        </div>
      )}
    </div>
  );
};

// Export with memo to prevent unnecessary re-renders when props don't change
export default memo(LoadingIndicator); 