import React, { useState } from "react";
import { useTranslation } from 'react-i18next';

/**
 * Mobile-optimized version of the SensorCard component
 * This provides a more compact and touch-friendly interface for mobile devices
 */
const MobileSensorCard = ({ 
  location, 
  data, 
  isActive, 
  lastSeen,
  rangeKey, 
  thresholds,
  getStatusColor 
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  
  // Threshold values with defaults
  const { high = 28, medium = 23, low = 18 } = thresholds?.teplota || {};
  
  // Calculate status based on temperature
  const temperature = data?.teplota;
  const temperatureValue = typeof temperature === 'number' ? temperature : parseFloat(temperature);
  const statusColor = !isNaN(temperatureValue) 
    ? getStatusColor(temperatureValue, { high, medium, low }) 
    : 'bg-gray-300';
  
  // Format time since last seen
  const getTimeSince = (timestamp) => {
    if (!timestamp) return t('unknown');
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return t('justNow');
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('minutesAgo')}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('hoursAgo')}`;
    
    return new Date(timestamp).toLocaleString();
  };
  
  const formatValue = (value, unit) => {
    if (value === undefined || value === null) return t('noData');
    if (typeof value === 'number') return `${value.toFixed(1)} ${unit}`;
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      return `${parseFloat(value).toFixed(1)} ${unit}`;
    }
    return `${value} ${unit}`;
  };

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-md shadow-md w-full mb-2 touch-manipulation"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main card content - always visible */}
      <div className="flex items-center p-3 relative">
        {/* Status indicator */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor}`}></div>
        
        {/* Temperature - main focus */}
        <div className="text-2xl font-bold flex-shrink-0 pl-2">
          {formatValue(temperature, '°C')}
        </div>
        
        {/* Location and status */}
        <div className="ml-3 flex-grow overflow-hidden">
          <div className="font-semibold text-sm truncate">{location}</div>
          <div className="flex items-center mt-1">
            <span 
              className={`
                inline-block w-2 h-2 rounded-full mr-1
                ${isActive ? 'bg-green-500' : 'bg-red-500'}
              `}
            ></span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isActive ? t('active') : t('inactive')}
            </span>
          </div>
        </div>
        
        {/* Expand/collapse indicator */}
        <div className="ml-2 flex-shrink-0">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-5 w-5 text-gray-400 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {/* Expanded content - only visible when expanded */}
      {expanded && (
        <div className="p-3 pt-0 border-t border-gray-100 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('humidity')}: </span>
              <span className="font-medium">{formatValue(data?.vlhkost, '%')}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('pressure')}: </span>
              <span className="font-medium">{formatValue(data?.tlak, 'hPa')}</span>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {rangeKey === 'live' && lastSeen && lastSeen[location] ? (
              <div>{t('lastUpdate')}: {getTimeSince(lastSeen[location])}</div>
            ) : (
              data?.time && <div>{t('lastUpdate')}: {new Date(data.time).toLocaleString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileSensorCard; 