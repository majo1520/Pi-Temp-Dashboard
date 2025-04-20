import React from 'react';
import { useDeviceDetect, useResponsiveLayout } from '../hooks';
import { MobileOptimizedStyle } from './MobileOptimized';

/**
 * Example component showing how to use the responsive hooks
 * This is a reference implementation - not meant to be used directly
 */
const ResponsiveDashboardExample = () => {
  // Use the device detection hook
  const { 
    isMobile, 
    isTablet, 
    isDesktop,
    orientation,
    screenWidth
  } = useDeviceDetect();
  
  // Use the responsive layout hook for advanced utilities
  const { 
    getFontSizes, 
    getSpacing, 
    getChartSize,
    getGridLayout
  } = useResponsiveLayout();
  
  // Get responsive values
  const fontSizes = getFontSizes();
  const spacing = getSpacing();
  const chartSize = getChartSize('line');
  const gridLayout = getGridLayout('cards');
  
  return (
    <div className={`${spacing.container}`}>
      {/* Device info banner */}
      <div className="bg-blue-100 dark:bg-blue-900 rounded-lg mb-4 p-3">
        <h2 className={`${fontSizes.heading} font-bold mb-2`}>
          Device Detection
        </h2>
        <p className={`${fontSizes.body}`}>
          Current device: <strong>
            {isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'}
          </strong>
        </p>
        <p className={`${fontSizes.body}`}>
          Orientation: <strong>{orientation}</strong>
        </p>
        <p className={`${fontSizes.body}`}>
          Screen width: <strong>{screenWidth}px</strong>
        </p>
      </div>
      
      {/* Responsive grid layout example */}
      <div className={`grid ${gridLayout} ${spacing.gap} ${spacing.section}`}>
        {[1, 2, 3, 4, 5, 6].map(item => (
          <div 
            key={item}
            className={`
              bg-white dark:bg-gray-800 rounded-lg shadow-md
              ${spacing.card}
            `}
          >
            <h3 className={`${fontSizes.subheading} font-bold mb-2`}>
              Card {item}
            </h3>
            <p className={`${fontSizes.body}`}>
              This card layout adjusts based on screen size.
            </p>
          </div>
        ))}
      </div>
      
      {/* Using MobileOptimizedStyle component */}
      <MobileOptimizedStyle
        baseStyles="rounded-lg shadow-md bg-white dark:bg-gray-800"
        mobileStyles="p-3 mt-2 text-sm"
        tabletStyles="p-4 mt-3 text-base"
        desktopStyles="p-5 mt-4 text-lg"
      >
        <h3 className="font-bold mb-2">Responsive Styling Component</h3>
        <p>This component has different padding and text size based on device.</p>
      </MobileOptimizedStyle>
      
      {/* Chart size recommendation */}
      <div className={`mt-6 ${spacing.section}`}>
        <h2 className={`${fontSizes.heading} font-bold mb-2`}>
          Chart Size Recommendations
        </h2>
        <div 
          style={{ 
            height: `${chartSize.height}px`,
            aspectRatio: chartSize.aspectRatio,
            maxWidth: '100%'
          }}
          className="bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center"
        >
          <p className={`${fontSizes.body} text-center`}>
            Recommended chart height: {chartSize.height}px<br/>
            Recommended aspect ratio: {chartSize.aspectRatio}
          </p>
        </div>
      </div>
      
      {/* Device-specific content example */}
      {isMobile ? (
        <div className="bg-green-100 dark:bg-green-900 rounded-lg p-3 mt-4">
          <h2 className={`${fontSizes.subheading} font-bold`}>
            Mobile-Specific Content
          </h2>
          <p className="mt-2">
            This content only appears on mobile devices.
            It can include simplified controls or mobile-optimized layouts.
          </p>
        </div>
      ) : isTablet ? (
        <div className="bg-purple-100 dark:bg-purple-900 rounded-lg p-4 mt-4">
          <h2 className={`${fontSizes.subheading} font-bold`}>
            Tablet-Specific Content
          </h2>
          <p className="mt-2">
            This content only appears on tablet devices.
            It can include medium-complexity controls and layouts.
          </p>
        </div>
      ) : (
        <div className="bg-amber-100 dark:bg-amber-900 rounded-lg p-5 mt-4">
          <h2 className={`${fontSizes.subheading} font-bold`}>
            Desktop-Specific Content
          </h2>
          <p className="mt-2">
            This content only appears on desktop devices.
            It can include advanced controls and complex layouts.
          </p>
        </div>
      )}
    </div>
  );
};

export default ResponsiveDashboardExample; 