import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChart } from '../contexts/ChartContext';
import useSensorData from '../hooks/useSensorData';
import { useFilter } from '../contexts/FilterContext';

/**
 * Component for configuring location colors used in cards and charts
 */
const LocationColorSettings = () => {
  const { t } = useTranslation();
  const { locationColors, updateLocationColor } = useChart();
  const [locations, setLocations] = useState([]);
  const { selectedLocations } = useFilter();
  
  // Get all locations from sensor data
  const { visibleLocationSensors } = useSensorData({}, {});
  
  // Extract all location names when sensors data is loaded - only show enabled locations
  useEffect(() => {
    if (visibleLocationSensors?.length > 0) {
      // Only use visible/enabled location sensors
      const locationNames = visibleLocationSensors.map(sensor => sensor.name);
      setLocations(locationNames);
    }
  }, [visibleLocationSensors]);
  
  const getLocationColor = (location) => {
    return locationColors[location] || locationColors.default;
  };
  
  // Sample of how colors will look in graphs/cards
  const renderColorSample = (color) => (
    <div 
      className="w-6 h-6 rounded-full border border-gray-300" 
      style={{ backgroundColor: color }}
    />
  );

  // Helper function to ensure colors are in 6-digit hex format
  const ensureFullHexFormat = (color) => {
    // If it's already a 6-digit hex, return it
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return color;
    }
    
    // If it's a 3-digit hex, convert to 6-digit
    if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    
    // Default fallback if invalid format
    return "#cccccc";
  };

  const handleColorChange = (location, e) => {
    const newColor = e.target.value;
    // Ensure the color is in the correct format
    const formattedColor = ensureFullHexFormat(newColor);
    
    // Update through ChartContext - this handles both localStorage and server
    updateLocationColor(location, formattedColor);
  };
  
  // Helper function to reset to default colors
  const resetToDefaultColors = () => {
    const defaultColors = {
      "IT OFFICE": "#3498db",
      "MARKETING": "#9b59b6",
      "IT SERVER ROOM": "#f39c12",
      "default": "#cccccc"
    };
    
    // Update each color individually to trigger the context update
    Object.entries(defaultColors).forEach(([loc, color]) => {
      updateLocationColor(loc, color);
    });
    
    // Also save directly to server as a failsafe
    fetch('/api/location-colors', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(defaultColors),
    })
    .then(response => {
      if (!response.ok) {
        if (response.status === 401) {
          console.warn("Authentication required to reset colors. Local settings updated but server was not updated.");
          return null;
        }
        console.error(`Server returned ${response.status}: ${response.statusText}`);
        throw new Error('Failed to save default colors to server');
      }
      return response.json();
    })
    .then(result => {
      if (result) {
        console.log("Default colors saved to server:", result);
      }
    })
    .catch(error => {
      console.error("Error saving default colors to server:", error);
    });
  };
  
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t('locationColorsDescription') || 'Customize colors for each location in both sensor cards and charts.'}
      </div>
      
      {/* Default color setting */}
      <div className="border-b pb-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {renderColorSample(locationColors.default)}
            <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('defaultColor') || 'Default Color'}
            </span>
          </div>
          <input
            type="color"
            value={locationColors.default}
            onChange={(e) => handleColorChange('default', e)}
            className="w-8 h-8 rounded cursor-pointer"
          />
        </div>
      </div>
      
      {/* List of locations with their colors */}
      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
        {locations.map(location => (
          <div key={location} className="flex items-center justify-between py-1">
            <div className="flex items-center">
              {renderColorSample(getLocationColor(location))}
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {location}
              </span>
            </div>
            <input
              type="color"
              value={getLocationColor(location)}
              onChange={(e) => handleColorChange(location, e)}
              className="w-8 h-8 rounded cursor-pointer"
            />
          </div>
        ))}
      </div>
      
      {/* Reset button */}
      <div className="mt-4">
        <button
          onClick={resetToDefaultColors}
          className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded transition-colors"
        >
          {t('resetToDefaultColors') || 'Reset to Default Colors'}
        </button>
      </div>
    </div>
  );
};

export default LocationColorSettings; 