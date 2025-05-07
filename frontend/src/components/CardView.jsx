import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A responsive card view component to display sensor data
 */
const CardView = ({ sensors = [], statuses = [] }) => {
  const { t } = useTranslation();
  const [timeAgo, setTimeAgo] = useState({});

  // Update time ago display every minute
  useEffect(() => {
    const updateTimeAgo = () => {
      const newTimeAgo = {};
      statuses.forEach(status => {
        if (status.lastSeen) {
          const ageMs = Date.now() - new Date(status.lastSeen).getTime();
          newTimeAgo[status.name] = formatTime(ageMs);
        }
      });
      setTimeAgo(newTimeAgo);
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000);
    return () => clearInterval(interval);
  }, [statuses]);

  // Format time difference in a user-friendly way
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  // Filter sensors that should be visible in card view
  const visibleSensors = sensors.filter(s => s.cardVisible !== false);

  if (visibleSensors.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>{t('noVisibleSensors')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {visibleSensors.map(sensor => {
        // Find status for this sensor
        const status = statuses.find(s => s.name === sensor.name) || {};
        const isOnline = status.online === true;
        
        // Determine status color
        let statusColor = "bg-gray-400";
        let statusText = t('unknown');
        let statusRingColor = "ring-gray-300";
        
        if (status.online === true) {
          statusColor = "bg-green-500";
          statusText = t('online');
          statusRingColor = "ring-green-300";
        } else if (status.online === false) {
          statusColor = "bg-red-500";
          statusText = t('offline');
          statusRingColor = "ring-red-300";
        }

        return (
          <div 
            key={sensor.name} 
            className="bg-white rounded-lg shadow-md overflow-hidden transform transition duration-200 hover:shadow-lg"
          >
            {/* Card header with sensor name and status */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-medium text-gray-800 truncate">{sensor.name}</h3>
              <div className="flex items-center">
                <div className={`relative flex h-4 w-4 ${isOnline ? "" : "opacity-80"}`}>
                  <span className={`absolute inline-flex h-full w-full rounded-full ${statusColor} ${isOnline ? "animate-ping opacity-75" : ""}`} 
                        style={{animationDuration: '3s'}}></span>
                  <span className={`relative inline-flex rounded-full h-4 w-4 ${statusColor}`}></span>
                </div>
                <span className="ml-2 text-sm font-medium text-gray-600">{statusText}</span>
              </div>
            </div>
            
            {/* Card body with sensor data */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Temperature */}
                {status.temperature !== undefined && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl mr-2">🌡️</span>
                      <div>
                        <p className="text-sm text-gray-500">{t('temperature')}</p>
                        <p className="text-lg font-semibold">{status.temperature.toFixed(1)}°C</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Humidity */}
                {status.humidity !== undefined && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl mr-2">💧</span>
                      <div>
                        <p className="text-sm text-gray-500">{t('humidity')}</p>
                        <p className="text-lg font-semibold">{status.humidity.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Pressure, if available */}
                {status.pressure !== undefined && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl mr-2">🔄</span>
                      <div>
                        <p className="text-sm text-gray-500">{t('pressure')}</p>
                        <p className="text-lg font-semibold">{status.pressure.toFixed(1)} hPa</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Last seen timestamp */}
                {status.lastSeen && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl mr-2">⏱️</span>
                      <div>
                        <p className="text-sm text-gray-500">{t('lastSeen')}</p>
                        <p className="text-lg font-semibold">{timeAgo[sensor.name] || ""} {t('ago')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Uptime/downtime information with visual indicator */}
              {(status.uptimeDuration || status.offlineDuration) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  {status.uptimeDuration && (
                    <div className="flex items-center mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                      <span className="text-sm text-gray-700">
                        {t('uptime')}: <span className="font-medium">{status.uptimeDuration}</span>
                      </span>
                    </div>
                  )}
                  
                  {status.offlineDuration && (
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                      <span className="text-sm text-gray-700">
                        {t('downtime')}: <span className="font-medium">{status.offlineDuration}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CardView; 