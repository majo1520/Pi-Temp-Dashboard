// AdminPanel.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { reloadTranslations } from './i18n';
import Chart from "react-apexcharts";
import { saveAs } from "file-saver";

// Custom hooks
import useSensors from "./hooks/useSensors";
import useSensorStatuses from "./hooks/useSensorStatuses";
import useLocationOrder from "./hooks/useLocationOrder";

// Components
import HeaderButton from "./components/admin/HeaderButton";
import SensorRow from "./components/admin/SensorRow";
import AdminSidebar from "./components/AdminSidebar";
import UsersManagement from "./components/UsersManagement";
import TelegramSettings from "./components/TelegramSettings";
import SystemMonitoring from "./components/admin/SystemMonitoring";

// Services
import * as api from "./services/api";

export default function AdminPanel() {
  // Use custom hooks
  const { 
    sensors, 
    isRefreshing, 
    loadSensors, 
    updateSingleField, 
    addLocation,
    refreshData 
  } = useSensors();
  
  // Use hook with disabled last readings
  const { getSensorStatus } = useSensorStatuses({ showLastReadings: false });
  
  const {
    draggedLocation,
    dropTarget,
    getSortedLocations,
    updateHiddenLocations,
    moveLocationUp,
    moveLocationDown,
    handleDragStart,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop
  } = useLocationOrder(sensors);

  // UI state
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showUsersManagement, setShowUsersManagement] = useState(false);
  const [showTelegramSettings, setShowTelegramSettings] = useState(false);
  const [showSystemMonitoring, setShowSystemMonitoring] = useState(false);
  const [showSensorManagement, setShowSensorManagement] = useState(true);
  
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // Force reload translations when the component mounts
  useEffect(() => {
    reloadTranslations();
    // Force Slovak language if needed
    if (i18n.language !== 'sk') {
      i18n.changeLanguage('sk');
    }
    console.log("Current language:", i18n.language);
  }, [i18n]);

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // Toggle user management visibility in main panel
  const toggleUsersManagement = () => {
    setShowUsersManagement(prev => !prev);
    if (showTelegramSettings) {
      setShowTelegramSettings(false);
    }
    if (showSystemMonitoring) {
      setShowSystemMonitoring(false);
    }
  };

  // Toggle Telegram settings visibility
  const toggleTelegramSettings = () => {
    setShowTelegramSettings(prev => !prev);
    if (showUsersManagement) {
      setShowUsersManagement(false);
    }
    if (showSystemMonitoring) {
      setShowSystemMonitoring(false);
    }
  };

  // Toggle System Monitoring visibility
  const toggleSystemMonitoring = () => {
    setShowSystemMonitoring(prev => !prev);
    if (showUsersManagement) {
      setShowUsersManagement(false);
    }
    if (showTelegramSettings) {
      setShowTelegramSettings(false);
    }
  };

  // Toggle Sensor Management visibility
  const toggleSensorManagement = () => {
    setShowSensorManagement(prev => !prev);
  };

  // Logout
  const handleLogout = () => {
    api.logout()
      .then(() => navigate("/login"))
      .catch(err => console.error("Error during logout:", err));
  };

  // Sorted locations for rendering
  const sortedLocations = getSortedLocations();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header with improved styling */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-800">
                {t('adminPanelTitle')}
              </h1>
              {isRefreshing && (
                <div className="ml-3 flex items-center">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <span className="ml-2 text-sm text-gray-500">{t('loading')}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className={`p-2 rounded-md text-sm transition-colors flex items-center ${
                isRefreshing ? "text-gray-400 cursor-not-allowed" : "text-blue-600 hover:bg-blue-50"
              }`}
              aria-label="Reload data"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('refresh')}
            </button>
            
            <button
              onClick={toggleUsersManagement}
              className={`p-2 rounded-md text-sm ${
                showUsersManagement ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              } transition-colors flex items-center`}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {t('users')}
            </button>
            
            <button
              onClick={toggleTelegramSettings}
              className={`p-2 rounded-md text-sm ${
                showTelegramSettings ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              } transition-colors flex items-center`}
            >
              {/* Telegram Icon */}
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              {t('telegramAlerts')}
            </button>
            
            <button
              onClick={toggleSystemMonitoring}
              className="p-2 rounded-md text-sm text-gray-600 hover:bg-gray-100 transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {t('systemHealth')}
            </button>
            
            <button
              onClick={toggleSensorManagement}
              className={`p-2 rounded-md text-sm ${
                showSensorManagement ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              } transition-colors flex items-center`}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              {t('manageSensors')}
            </button>
            
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with improved styling */}
        <AdminSidebar 
          isOpen={sidebarVisible} 
          sensors={sensors || []}
          onReloadSensors={refreshData}
          onAddLocation={addLocation}
          onHideLocation={updateHiddenLocations}
          onToggleUsersManagement={toggleUsersManagement}
          onToggleTelegramSettings={toggleTelegramSettings}
          onToggleSystemMonitoring={toggleSystemMonitoring}
          onToggleSensorManagement={toggleSensorManagement}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4">
          {/* Modal components */}
          {showUsersManagement && <UsersManagement t={t} onClose={toggleUsersManagement} />}
          {showTelegramSettings && <TelegramSettings t={t} onClose={toggleTelegramSettings} />}
          {showSystemMonitoring && <SystemMonitoring t={t} onClose={toggleSystemMonitoring} />}

          {/* Sensors table with improved styling */}
          {showSensorManagement && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-800">{t('manageSensors')}</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={refreshData}
                  disabled={isRefreshing}
                  className={`p-2 rounded-full ${
                    isRefreshing ? "text-gray-400" : "text-blue-600 hover:bg-blue-50"
                  }`}
                  title={t('refresh')}
                >
                  <svg className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const locationName = window.prompt(t('addLocationPrompt') || 'Zadajte názov novej lokality:');
                    if (locationName) addLocation(locationName);
                  }}
                  className="p-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center"
                  title={t('addLocationTooltip')}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {t('addLocation')}
                </button>
                  {/* Add close button for sensors section */}
                  <button
                    onClick={toggleSensorManagement}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    title={t('close') || 'Close'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('status')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('sensorName')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('data')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('cards')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('locations')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Render locations and sensors */}
                  {sortedLocations.map((location) => {
                    // Get sensors for this location
                    const locationSensors = sensors.filter(sensor => 
                      sensor.name.split('_')[0] === location
                    );
                    
                    return (
                      <React.Fragment key={location}>
                        {/* Only show the hint when dragging starts */}
                        {draggedLocation && location === 0 && (
                          <tr>
                            <td colSpan={7} className="p-2 bg-yellow-50 dark:bg-yellow-900/20 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-yellow-600 dark:text-yellow-400">💡</span>
                                <span>{t('dragDropHint') || 'Lokality môžete presúvať ťahaním alebo pomocou šípok'}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        
                        {/* Location header row with drag and drop */}
                        <tr 
                          className={`${
                            draggedLocation === location 
                              ? 'bg-blue-200 dark:bg-blue-800/60' 
                              : dropTarget === location
                                ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-400 dark:border-green-600' 
                                : 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                          } transition-colors duration-150 cursor-move`}
                          draggable="true"
                          onDragStart={() => handleDragStart(location)}
                          onDragEnter={() => handleDragEnter(location)}
                          onDragLeave={handleDragLeave}
                          onDragOver={(e) => { e.preventDefault(); }}
                          onDrop={() => handleDrop(location)}
                        >
                          <td colSpan={7} className="p-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-gray-500 dark:text-gray-400">≡</span>
                                <span className="font-bold text-blue-800 dark:text-blue-300">{location}</span>
                                {draggedLocation === location && (
                                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                    {t('dragging') || 'Presúvanie...'}
                                  </span>
                                )}
                                {dropTarget === location && (
                                  <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                                    {t('dropHere') || 'Pustiť sem'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => moveLocationUp(location)}
                                  className="p-1 px-2.5 text-gray-600 hover:text-white hover:bg-blue-600 rounded"
                                >
                                  ▲
                                </button>
                                <button 
                                  onClick={() => moveLocationDown(location)}
                                  className="p-1 px-2.5 text-gray-600 hover:text-white hover:bg-blue-600 rounded"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        
                        {/* Render rows for each sensor in this location */}
                        {locationSensors.map(sensor => (
                          <SensorRow 
                            key={sensor.name}
                            sensor={sensor}
                            status={getSensorStatus(sensor.name)}
                            onUpdate={(field, value) => updateSingleField(sensor.name, field, value)}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Funkcia generuje stacked data pre graf (Online/Offline). */
function generateStackedData(uptimeData) {
  // Add extra safety checks at the beginning
  if (!uptimeData) {
    console.warn('generateStackedData received undefined/null uptimeData');
    const now = new Date().getTime();
    return { 
      online: [{ x: now, y: null }],
      offline: [{ x: now, y: null }]
    };
  }

  const gapThreshold = 30 * 60 * 1000; // 30 min for gap display
  const sampleInterval = 5 * 60 * 1000; // 5 min for downsampling
  const briefOutageThreshold = 5 * 60 * 1000; // 5 min threshold for brief outages
  const onlineSeries = [];
  const offlineSeries = [];
  let previousSampleTime = null;
  let previousStatus = null;
  let lastOnlineTime = null;

  if (!Array.isArray(uptimeData) || uptimeData.length === 0) {
    // Return data with at least one valid point to prevent ApexCharts errors
    const now = new Date().getTime();
    return { 
      online: [{ x: now, y: null }],
      offline: [{ x: now, y: null }]
    };
  }

  // Sort data by timestamp to ensure proper sequence
  const sortedData = [...uptimeData].sort((a, b) => {
    const timeA = a.timestamp || a._time;
    const timeB = b.timestamp || b._time;
    return new Date(timeA) - new Date(timeB);
  });
  
  // Process the data points
  for (let i = 0; i < sortedData.length; i++) {
    const point = sortedData[i];
    const timeStr = point.timestamp || point._time;
    if (!timeStr) continue;
    
    const isoTimestamp = timeStr.replace(" ", "T");
    const currentTime = new Date(isoTimestamp).getTime();
    
    // Make sure we have a valid timestamp
    if (isNaN(currentTime)) continue;
    
    // Get startTime if available to determine the beginning of the current uptime period
    const startTimeStr = point.startTime;
    let startTime = null;
    if (startTimeStr) {
      try {
        startTime = new Date(startTimeStr.replace(" ", "T")).getTime();
      } catch (e) {
        // Invalid startTime format, ignore
      }
    }
    
    // Determine if point is online based on the data
    // Fix: Be more explicit about checking online status
    const isOnline = point.online !== undefined ? point.online !== false : null;
    
    // Skip points with undefined status
    if (isOnline === null) continue;
    
    // Track changes in online status
    if (isOnline && previousStatus === false) {
      // Transition from offline to online
      
      // Check if this is a brief outage (less than the threshold)
      const isBriefOutage = lastOnlineTime && (currentTime - lastOnlineTime < briefOutageThreshold);
      
      if (isBriefOutage) {
        // For brief outages, retroactively mark the gap as online to maintain continuity
        // This prevents uptime from resetting over brief network issues
        if (onlineSeries.length > 0 && offlineSeries.length > 0) {
          // Find the last pair of points that marked the beginning of the offline period
          const lastIndex = onlineSeries.length - 1;
          if (onlineSeries[lastIndex].y === null && offlineSeries[lastIndex].y === null) {
            // Convert these gap markers to normal online points
            onlineSeries[lastIndex].y = 1;
            offlineSeries[lastIndex].y = null;
          }
        }
      }
    } else if (!isOnline && previousStatus === true) {
      // Transition from online to offline
      lastOnlineTime = previousSampleTime;
    }
    
    // Check if this is a restart point
    const isRestartPoint = startTime && 
                          previousSampleTime && 
                          (currentTime - previousSampleTime > 10 * 60 * 1000); // Gap of more than 10 minutes

    // Downsampling - skip points too close together unless status changes or it's a restart
    if (previousSampleTime && 
        (currentTime - previousSampleTime < sampleInterval) && 
        isOnline === previousStatus && 
        !isRestartPoint) {
      continue;
    }
    
    // If there's a significant gap in data or a restart, add null points to create a visual gap
    if (previousSampleTime && (currentTime - previousSampleTime > gapThreshold || isRestartPoint)) {
      // Add gap end point
      onlineSeries.push({ x: previousSampleTime + 1, y: null });
      offlineSeries.push({ x: previousSampleTime + 1, y: null });
      
      // If it's a restart and we have a valid startTime, add offline period
      if (isRestartPoint && startTime && startTime < currentTime) {
        // Add offline period from previous sample until startTime
        onlineSeries.push({ x: startTime - 1, y: null });
        offlineSeries.push({ x: startTime - 1, y: 1 }); // Offline until restart
        
        // Add restart point (beginning of online period)
        onlineSeries.push({ x: startTime, y: 1 });
        offlineSeries.push({ x: startTime, y: null });
      } else {
        // Add gap start point
        onlineSeries.push({ x: currentTime - 1, y: null });
        offlineSeries.push({ x: currentTime - 1, y: null });
      }
    }
    
    // Add the current data point with explicit status values
    onlineSeries.push({ x: currentTime, y: isOnline ? 1 : null });
    offlineSeries.push({ x: currentTime, y: isOnline ? null : 1 });
    
    previousSampleTime = currentTime;
    previousStatus = isOnline;
  }
  
  // Add proper end point if the sensor is currently offline
  const now = Date.now();
  if (sortedData.length > 0) {
    const lastTimepoint = sortedData[sortedData.length - 1];
    const lastTimepointTime = new Date(lastTimepoint.timestamp || lastTimepoint._time).getTime();
    const isOfflineThreshold = 10 * 60 * 1000; // 10 minutes
    
    if (now - lastTimepointTime > isOfflineThreshold) {
      // Sensor is currently offline, add a point to show it
      onlineSeries.push({ x: now, y: null });
      offlineSeries.push({ x: now, y: 1 });
    }
  }
  
  // Ensure we have at least one point to prevent ApexCharts errors
  if (onlineSeries.length === 0) {
    const now = new Date().getTime();
    onlineSeries.push({ x: now, y: null });
    offlineSeries.push({ x: now, y: null });
  }
  
  // Add a final safety check before returning
  if (!Array.isArray(onlineSeries) || onlineSeries.length === 0) {
    const now = new Date().getTime();
    return { 
      online: [{ x: now, y: null }],
      offline: [{ x: now, y: null }]
    };
  }
  
  return { online: onlineSeries, offline: offlineSeries };
}

// Helper function to preprocess 365d data - optimized for better performance
function preprocessLongRangeData(data) {
  if (!Array.isArray(data) || data.length === 0) return data;
  
  // Sort data by timestamp
  const sortedData = [...data].sort((a, b) => {
    const timeA = a.timestamp || a._time;
    const timeB = b.timestamp || b._time;
    return new Date(timeA) - new Date(timeB);
  });
  
  // For very large datasets, we need to be more aggressive with sampling
  const targetPointCount = 1000; // Target number of points for smooth rendering
  const samplingFactor = Math.ceil(sortedData.length / targetPointCount);
  
  if (samplingFactor <= 1) {
    return sortedData; // Small enough dataset, no preprocessing needed
  }
  
  const dailyProcessed = [];
  let currentDay = null;
  let statusChangePoints = [];
  
  // First pass: collect all status change points as these are the most important
  let prevStatus = null;
  for (let i = 0; i < sortedData.length; i++) {
    const point = sortedData[i];
    const timeStr = point.timestamp || point._time;
    if (!timeStr) continue;
    
    const currentStatus = point.online !== false;
    
    // Always include status change points
    if (prevStatus !== currentStatus || i === 0 || i === sortedData.length - 1) {
      statusChangePoints.push(i);
      prevStatus = currentStatus;
    }
  }
  
  // Second pass: add regular sample points plus all status change points
  for (let i = 0; i < sortedData.length; i++) {
    const point = sortedData[i];
    
    // Always include status change points and regular samples
    if (statusChangePoints.includes(i) || i % samplingFactor === 0) {
      dailyProcessed.push(point);
    }
  }
  
  // Always ensure the last point is included
  const lastPoint = sortedData[sortedData.length - 1];
  if (!dailyProcessed.includes(lastPoint)) {
    dailyProcessed.push(lastPoint);
  }
  
  console.log(`Reduced dataset from ${sortedData.length} to ${dailyProcessed.length} points`);
  return dailyProcessed;
}
