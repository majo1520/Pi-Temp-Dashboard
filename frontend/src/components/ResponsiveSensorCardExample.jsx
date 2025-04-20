import React from 'react';
import MobileOptimized from './MobileOptimized';
import SensorCard from './SensorCard';
import MobileSensorCard from './MobileSensorCard';

/**
 * Example component showing how to use responsive components with the SensorCard
 * This is a demonstration of how to implement device-specific views without modifying the original components
 */
const ResponsiveSensorCardExample = (props) => {
  // Just pass all the props to the appropriate card component based on device type
  return (
    <MobileOptimized
      mobile={<MobileSensorCard {...props} />}
      desktop={<SensorCard {...props} />}
    />
  );
};

export default ResponsiveSensorCardExample; 