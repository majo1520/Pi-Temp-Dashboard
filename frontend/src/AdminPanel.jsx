// AdminPanel.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Chart from "react-apexcharts";
import { saveAs } from "file-saver";
import AdminSidebar from "./components/AdminSidebar";
import UsersManagement from "./components/UsersManagement";
import TelegramSettings from "./components/TelegramSettings";
import * as api from "./services/api";
import { useTranslation } from 'react-i18next';
import { reloadTranslations } from './i18n';

// Simple header action button component
const HeaderButton = ({ icon, label, onClick, color = "gray", disabled = false }) => (
  <button
    onClick={onClick}
    className={`flex items-center px-3 py-1.5 text-sm rounded transition-colors
      ${color === "red" 
        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50" 
        : color === "blue"
        ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}
    `}
    title={label}
    disabled={disabled}
  >
    <span className="mr-1.5">{icon}</span>
    <span>{label}</span>
  </button>
);

export default function AdminPanel() {
  const [sensors, setSensors] = useState([]);
  const [sensorStatuses, setSensorStatuses] = useState([]);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showUsersManagement, setShowUsersManagement] = useState(false);
  const [showTelegramSettings, setShowTelegramSettings] = useState(false);
  const { t, i18n } = useTranslation();
  
  // Add state for hidden locations
  const [hiddenLocations, setHiddenLocations] = useState([]);
  const [locationOrder, setLocationOrder] = useState([]);
  const [draggedLocation, setDraggedLocation] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const navigate = useNavigate();
  
  // Add loading state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Force reload translations when the component mounts
  useEffect(() => {
    reloadTranslations();
  }, []);
  
  // Load hidden locations and order on component mount
  useEffect(() => {
    const storedHiddenLocations = localStorage.getItem('hiddenLocations');
    if (storedHiddenLocations) {
      try {
        const parsedHiddenLocations = JSON.parse(storedHiddenLocations);
        console.log("Loading hidden locations from localStorage:", parsedHiddenLocations);
        setHiddenLocations(parsedHiddenLocations);
      } catch (e) {
        console.error("Error parsing hidden locations:", e);
      }
    }
    
    // Load location order
    const storedLocationOrder = localStorage.getItem('locationOrder');
    if (storedLocationOrder) {
      try {
        setLocationOrder(JSON.parse(storedLocationOrder));
      } catch (e) {
        console.error("Error parsing location order:", e);
      }
    }
  }, []);
  
  // Save location order when it changes
  useEffect(() => {
    if (locationOrder.length > 0) {
      localStorage.setItem('locationOrder', JSON.stringify(locationOrder));
    }
  }, [locationOrder]);

  // Add effect to initialize location order
  useEffect(() => {
    // Initialize location order if needed
    if (locationOrder.length === 0 && sensors.length > 0) {
      const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
      if (allLocations.length > 0) {
        setLocationOrder(allLocations);
      }
    }
  }, [sensors, locationOrder]);

  // Add new effect to enforce hidden locations
  useEffect(() => {
    // This ensures hidden locations are consistently applied after data is loaded
    if (sensors.length > 0 && hiddenLocations.length > 0) {
      console.log("Enforcing hidden locations after sensors changed:", hiddenLocations);
      
      // Get unique locations from loaded sensors
      const uniqueLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
      
      // Check if any hidden location doesn't exist in current data
      const validHiddenLocations = hiddenLocations.filter(
        loc => uniqueLocations.includes(loc)
      );
      
      // Update hidden locations if they've changed (some might no longer exist)
      if (validHiddenLocations.length !== hiddenLocations.length) {
        console.log("Cleaning up hidden locations list - removing non-existent locations");
        setHiddenLocations(validHiddenLocations);
        localStorage.setItem('hiddenLocations', JSON.stringify(validHiddenLocations));
      }
    }
  }, [sensors, hiddenLocations]);

  // Načítanie zoznamu senzorov
  const loadSensors = () => {
    // Add a cache-busting parameter to avoid stale data
    const cacheBuster = `?_=${Date.now()}`;
    
    return api.getSensors()
      .then(data => {
        // Log the received sensors
        console.log("Fetched sensors from API:", data);
        
        // Apply sensor data without filtering (we filter in the render)
        setSensors(data);
        return data;
      })
      .catch(err => {
        console.error("Chyba pri načítaní senzorov:", err);
        throw err;
      });
  };

  useEffect(() => {
    loadSensors()
      .catch(err => console.error("Error loading sensors on mount:", err));
  }, []);

  // Načítanie statusov
  const loadStatuses = () => {
    return api.getSensorStatuses()
      .then(data => {
        if (Array.isArray(data)) {
          setSensorStatuses(data);
          return data;
        } else {
          console.error("Neočakávaný formát statusov:", data);
          throw new Error("Unexpected status format");
        }
      })
      .catch(err => {
        console.error("Chyba pri načítaní statusov:", err);
        throw err;
      });
  };

  useEffect(() => {
    loadStatuses();
    const interval = setInterval(loadStatuses, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, []);

  // Format duration in human-readable format (days, hours, minutes)
  const formatDuration = (ms) => {
    if (!ms) return null;
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Get sensor status for display
  const getSensorStatus = (sensorName) => {
    const st = sensorStatuses.find(s => s.name === sensorName) || {};
    const currentTime = Date.now();
    
    // Determine if sensor is online based on last seen time
    const lastSeenTime = st.lastSeen ? new Date(st.lastSeen).getTime() : 0;
    const timeSince = lastSeenTime ? currentTime - lastSeenTime : null;
    const isOnline = st.online; // Use the online status from the API directly
    
    // For display in table
    let uptimeDuration = null;
    let offlineDuration = null;

    // Simply use the uptime and offline duration values from the API
    if (isOnline) {
      uptimeDuration = st.uptimeDuration;
    } else {
      offlineDuration = st.offlineDuration;
    }
    
    return {
      online: isOnline,
      lastSeen: st.lastSeen,
      uptimeDuration,
      offlineDuration, 
      startTime: st.startTime,
    };
  };

  // Zmena viditeľnosti (prepínače)
  const updateSingleField = (name, field, value) => {
    console.log(`Updating visibility for ${name}: ${field} = ${value}`); // Debug log
    api.updateSensorVisibility(name, { [field]: value })
      .then(() => {
        setSensors(prev =>
          prev.map(sensor =>
            sensor.name === name ? { ...sensor, [field]: value } : sensor
          )
        );
      })
      .catch(err => console.error("Chyba pri zmene viditeľnosti:", err));
  };

  // Pridanie novej lokácie
  const handleAddLocation = (locationName) => {
    if (!locationName) return;
    
    api.addLocation(locationName)
      .then(() => {
        loadSensors();
      })
      .catch(err => console.error("Chyba pri pridávaní lokácie:", err));
  };

  // Logout
  const handleLogout = () => {
    api.logout()
      .then(() => navigate("/login"))
      .catch(err => console.error("Chyba pri odhlasovaní:", err));
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // Add a handler for when locations are hidden/shown
  const handleHideLocations = (newHiddenLocations) => {
    console.log("Updating hidden locations:", newHiddenLocations);
    setHiddenLocations(newHiddenLocations);
    // Save to localStorage to persist across refreshes
    localStorage.setItem('hiddenLocations', JSON.stringify(newHiddenLocations));
  };

  // Move a location up in the order
  const moveLocationUp = (location) => {
    setLocationOrder(prev => {
      // If location isn't in order yet, initialize the order
      if (prev.length === 0) {
        const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
        prev = [...allLocations];
      }
      
      const index = prev.indexOf(location);
      // Can't move up if it's already at the top
      if (index <= 0) return prev;
      
      const newOrder = [...prev];
      // Swap with the item above
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
      return newOrder;
    });
  };
  
  // Move a location down in the order
  const moveLocationDown = (location) => {
    setLocationOrder(prev => {
      // If location isn't in order yet, initialize the order
      if (prev.length === 0) {
        const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
        prev = [...allLocations];
      }
      
      const index = prev.indexOf(location);
      // Can't move down if it's already at the bottom or not found
      if (index === -1 || index >= prev.length - 1) return prev;
      
      const newOrder = [...prev];
      // Swap with the item below
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };

  // Start drag operation
  const handleDragStart = (location) => {
    setDraggedLocation(location);
  };
  
  // Handle drag enter to show drop target
  const handleDragEnter = (location) => {
    if (draggedLocation && draggedLocation !== location) {
      setDropTarget(location);
    }
  };
  
  // Handle drag leave to clear drop target
  const handleDragLeave = () => {
    setDropTarget(null);
  };
  
  // Handle dropping a location
  const handleDrop = (targetLocation) => {
    if (!draggedLocation || draggedLocation === targetLocation) {
      setDraggedLocation(null);
      setDropTarget(null);
      return;
    }
    
    setLocationOrder(prev => {
      // If order is empty, initialize it
      if (prev.length === 0) {
        const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
        prev = [...allLocations];
      }
      
      const draggedIndex = prev.indexOf(draggedLocation);
      const targetIndex = prev.indexOf(targetLocation);
      
      if (draggedIndex === -1 || targetIndex === -1) {
        return prev;
      }
      
      // Create new array without the dragged location
      const newOrder = prev.filter(loc => loc !== draggedLocation);
      
      // Insert the dragged location at its new position
      newOrder.splice(targetIndex, 0, draggedLocation);
      
      return newOrder;
    });
    
    setDraggedLocation(null);
    setDropTarget(null);
  };
  
  // Handle drag over (needed for drop to work)
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Toggle user management visibility in main panel
  const toggleUsersManagement = () => {
    setShowUsersManagement(prev => !prev);
    if (showTelegramSettings) {
      setShowTelegramSettings(false);
    }
  };

  // Toggle Telegram settings visibility
  const toggleTelegramSettings = () => {
    setShowTelegramSettings(prev => !prev);
    if (showUsersManagement) {
      setShowUsersManagement(false);
    }
  };

  // Refresh all data
  const refreshData = () => {
    console.log("Refreshing all data...");
    setIsRefreshing(true);
    
    // Load sensors and statuses
    Promise.all([
      loadSensors(),
      loadStatuses()
    ])
    .then(() => {
      console.log("Data refresh complete");
    })
    .catch(err => {
      console.error("Error refreshing data:", err);
    })
    .finally(() => {
      setIsRefreshing(false);
    });
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      <AdminSidebar 
        onReloadSensors={loadSensors} 
        sensors={sensors} 
        onAddLocation={handleAddLocation}
        onHideLocation={handleHideLocations}
        onToggleUsersManagement={toggleUsersManagement}
      />
      
      <div className="flex-1 flex flex-col">
        <header className="bg-white dark:bg-gray-900 shadow border-b dark:border-gray-800 px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-medium text-gray-800 dark:text-white">{t('adminPanelTitle')}</h1>
          <div className="flex space-x-2">
            <HeaderButton
              icon="🌍"
              label={i18n.language === 'sk' ? 'SK / EN' : 'EN / SK'}
              onClick={() => i18n.changeLanguage(i18n.language === 'sk' ? 'en' : 'sk')}
              color="blue"
            />
            <HeaderButton
              icon="👥"
              label={showUsersManagement ? t('hideUsers') || "Hide Users" : t('showUsers') || "Show Users"}
              onClick={toggleUsersManagement}
              color={showUsersManagement ? "blue" : "gray"}
            />
            <HeaderButton
              icon="🔔"
              label={t('telegramAlerts') || 'Telegram Alerts'}
              onClick={toggleTelegramSettings}
              color={showTelegramSettings ? "blue" : "gray"}
            />
            <HeaderButton
              icon={isRefreshing ? "⏳" : "🔄"}
              label={isRefreshing ? (t('refreshing') || "Refreshing...") : (t('refresh') || "Refresh")}
              onClick={refreshData}
              disabled={isRefreshing}
            />
            <HeaderButton
              icon="🚪"
              label={t('logout') || "Logout"}
              onClick={handleLogout}
              color="red"
            />
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-6">
          {/* Users Management Section (conditionally shown in main view) */}
          {showUsersManagement && (
            <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
                <h2 className="text-lg font-medium text-blue-800 dark:text-blue-300">{t('userManagement') || 'Manage Users'}</h2>
                <button 
                  onClick={toggleUsersManagement}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
              <div className="p-6">
                <UsersManagement t={t} />
              </div>
            </div>
          )}
          
          {/* Telegram Settings Section (conditionally shown in main view) */}
          {showTelegramSettings && (
            <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
                <h2 className="text-lg font-medium text-blue-800 dark:text-blue-300">{t('telegramAlerts') || 'Telegram Alerts'}</h2>
                <button 
                  onClick={toggleTelegramSettings}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
              <div className="p-6">
                <TelegramSettings t={t} />
              </div>
            </div>
          )}
          
          {/* Existing sensor data and charts */}
          <div className="flex flex-wrap -mx-2">
            {/* Tabuľka so senzormi */}
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-x-auto mb-6 w-full">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                  <tr>
                    <th className="p-3 text-center font-semibold">📍 {t('sensorName')}</th>
                    <th className="p-3 font-semibold">📌 {t('locations')}</th>
                    <th className="p-3 font-semibold">🧾 {t('cards')}</th>
                    <th className="p-3 text-right font-semibold">🧠 {t('status')}</th>
                    <th className="p-3 text-right font-semibold">📊 {t('graph')}</th>
                    <th className="p-3 text-right font-semibold">🗑️</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Get all unique locations
                    let locations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
                    
                    // Sort locations according to custom order
                    if (locationOrder.length > 0) {
                      locations.sort((a, b) => {
                        const indexA = locationOrder.indexOf(a);
                        const indexB = locationOrder.indexOf(b);
                        
                        // If not in order array, put at the end
                        if (indexA === -1 && indexB === -1) return 0;
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        
                        return indexA - indexB;
                      });
                    }
                    
                    // Filter out hidden locations
                    locations = locations.filter(loc => !hiddenLocations.includes(loc));
                    
                    // Render each location group
                    return locations.map((location, index) => {
                      // Get sensors for this location
                      const locationSensors = sensors.filter(sensor => 
                        sensor.name.split('_')[0] === location
                      );
                      
                      return (
                        <React.Fragment key={location}>
                          {/* Only show the hint when dragging starts */}
                          {draggedLocation && index === 0 && (
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
                            onDragOver={handleDragOver}
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
                                    title={t('moveUp')}
                                  >
                                    ↑
                                  </button>
                                  <button 
                                    onClick={() => moveLocationDown(location)}
                                    className="p-1 px-2.5 text-gray-600 hover:text-white hover:bg-blue-600 rounded"
                                    title={t('moveDown')}
                                  >
                                    ↓
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          
                          {/* Sensors for this location */}
                          {locationSensors.map(sensor => (
                            <SensorRow
                              key={sensor.name}
                              sensor={sensor}
                              getSensorStatus={getSensorStatus}
                              updateSingleField={updateSingleField}
                              reloadSensors={loadSensors}
                              t={t}
                            />
                          ))}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Jeden senzor v tabuľke */
function SensorRow({ sensor, getSensorStatus, updateSingleField, reloadSensors, t }) {
  const [showChart, setShowChart] = useState(false);
  const [range, setRange] = useState("24h");
  const [uptimeData, setUptimeData] = useState([]);
  const [chartError, setChartError] = useState(null);
  const status = getSensorStatus(sensor.name);

  // Debounce
  const [debouncedRange, setDebouncedRange] = useState(range);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRange(range), 300);
    return () => clearTimeout(timer);
  }, [range]);

  // Load data if showChart
  useEffect(() => {
    if (!showChart) return;
    
    setChartError(null);
    
    console.log(`Fetching data for ${sensor.name} with range: ${debouncedRange}`);
    
    // Set loading timeout for long-running requests
    const timeoutId = setTimeout(() => {
      console.log(`Request for ${sensor.name} with range ${debouncedRange} is taking a long time...`);
    }, 5000);
    
    api.getSensorHistory(sensor.name, debouncedRange)
      .then(data => {
        clearTimeout(timeoutId);
        
        console.log(`Received ${data?.length || 0} data points for ${sensor.name} with range ${debouncedRange}`);
        
        // Check for valid data
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn(`No data received for ${sensor.name} with range ${debouncedRange}`);
          setUptimeData([]);
          return;
        }
        
        // Log first and last data point for debugging
        const first = data[0];
        const last = data[data.length - 1];
        console.log('First data point:', first);
        console.log('Last data point:', last);
        
        // Special handling for 365d view - pre-aggregate data to improve performance
        if (debouncedRange === "365d") {
          console.log(`Processing 365d data for ${sensor.name} with ${data.length} points`);
          
          // For 365d, always preprocess for better performance
          const processedData = preprocessLongRangeData(data);
          setUptimeData(processedData);
        } else {
          setUptimeData(data);
        }
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error(`Error fetching data for ${sensor.name} with range ${debouncedRange}:`, err);
        setChartError(err.message || "Error loading chart data");
        setUptimeData([]);
      });
      
    return () => {
      clearTimeout(timeoutId);
    };
  }, [sensor.name, debouncedRange, showChart]);

  const { online, offline } = useMemo(
    () => generateStackedData(uptimeData),
    [uptimeData]
  );

  const downloadCSV = () => {
    const header = "timestamp,online";
    const csvRows = uptimeData.map((d) => {
      const timeStr = d.timestamp || d._time;
      if (!timeStr) return "";
      const isoTs = timeStr.replace(" ", "T");
      const ts = new Date(isoTs).toISOString();
      const isOn = d.online === false ? "Offline" : "Online";
      return `${ts},${isOn}`;
    });
    const blob = new Blob([header + "\n" + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    saveAs(blob, `${sensor.name}_${range}.csv`);
  };

  // farba stavu
  const isHidden =
    sensor.cardVisible === false && sensor.locationVisible === false;
  const ageMs = status.lastSeen
    ? Date.now() - new Date(status.lastSeen).getTime()
    : Infinity;
  let statusColor = "bg-gray-400";
  if (status.lastSeen) {
    if (ageMs > 10 * 60 * 1000) statusColor = "bg-red-500";
    else statusColor = "bg-green-500";
  }

  // Zmazanie lokácie
  const handleDeleteLocation = () => {
    if (!window.confirm(t('deleteConfirmation'))) return;
    
    api.deleteLocation(sensor.name)
      .then(msg => {
        alert(msg);
        if (typeof reloadSensors === "function") reloadSensors();
      })
      .catch(err => {
        console.error(err);
        alert("Nepodarilo sa zmazať lokáciu");
      });
  };

  const [cursorInfo, setCursorInfo] = useState(null);
  const timelineRef = useRef(null);
  
  // Enhanced data aggregation for long ranges
  const aggregatedData = useMemo(() => {
    if (!Array.isArray(online) || online.length === 0) return { aggregated: [], timeMarkers: [] };
    
    const totalTimespan = online[online.length - 1].x - online[0].x;
    const startTime = online[0].x;
    const endTime = online[online.length - 1].x;
    
    // Determine how many segments we want based on time range
    let segmentCount = 24; // Default for 24h view
    
    if (range === '7d') segmentCount = 28; // 4-hour segments for 7 days
    else if (range === '30d') segmentCount = 30; // Daily segments for 30 days
    else if (range === '365d') segmentCount = 24; // ~15-day segments for a year
    
    const segmentDuration = totalTimespan / segmentCount;
    const aggregated = [];
    const timeMarkers = [];
    
    // Generate time markers for the x-axis (more points for better readability)
    const markerCount = Math.min(10, segmentCount);
    const markerInterval = totalTimespan / (markerCount - 1);
    
    for (let i = 0; i < markerCount; i++) {
      const markerTime = startTime + (i * markerInterval);
      timeMarkers.push(markerTime);
    }
    
    // Aggregate data into segments
    for (let i = 0; i < segmentCount; i++) {
      const segmentStart = startTime + (i * segmentDuration);
      const segmentEnd = segmentStart + segmentDuration;
      
      // Find all points that fall within this segment
      const segmentPoints = online.filter(point => 
        point.x >= segmentStart && point.x < segmentEnd && point.y === 1
      );
      
      // Calculate what percentage of this segment was online
      const onlineTime = segmentPoints.reduce((total, current, index, array) => {
        if (index === 0) return 0;
        const prevPoint = array[index - 1];
        if (prevPoint.y === 1 && current.y === 1) {
          return total + (current.x - prevPoint.x);
        }
        return total;
      }, 0);
      
      const onlinePercentage = segmentPoints.length > 0 ? 
        Math.min(1, onlineTime / segmentDuration) : 0;
      
      aggregated.push({
        startTime: segmentStart,
        endTime: segmentEnd,
        onlinePercentage: onlinePercentage,
        hasData: segmentPoints.length > 0
      });
    }
    
    return { aggregated, timeMarkers };
  }, [online, range]);
  
  // Handle mouse move to show cursor info
  const handleMouseMove = (e) => {
    if (!timelineRef.current || !online || online.length === 0) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const percentage = relativeX / rect.width;
    
    // Calculate the time at cursor position
    const timeRange = online[online.length - 1].x - online[0].x;
    const cursorTime = online[0].x + (timeRange * percentage);
    
    // Find the closest data point to display its status
    let closestPoint = null;
    let minDistance = Infinity;
    
    for (const point of online) {
      const distance = Math.abs(point.x - cursorTime);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }
    
    setCursorInfo({
      time: cursorTime,
      status: closestPoint?.y === 1 ? 'online' : 'offline',
      position: relativeX
    });
  };
  
  const handleMouseLeave = () => {
    setCursorInfo(null);
  };

  return (
    <>
      <tr
        className={`border-t hover:bg-gray-100 ${
          isHidden ? "text-gray-400 bg-gray-50" : ""
        }`}
      >
        <td className="p-2 font-medium text-center">
          {sensor.name}
          {isHidden && (
            <span className="ml-1 text-xs" title={t('hidden')}>
              🔒
            </span>
          )}
        </td>
        <td className="p-2">
          {/* Prepínač locationVisible */}
          <label className="flex justify-center items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={sensor.locationVisible !== false}
              onChange={(e) =>
                updateSingleField(sensor.name, "locationVisible", e.target.checked)
              }
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 relative">
              <div className="w-5 h-5 bg-white rounded-full shadow absolute top-0.5 left-0.5 peer-checked:translate-x-full transition-transform duration-300"></div>
            </div>
          </label>
        </td>
        <td className="p-2">
          {/* Prepínač cardVisible */}
          <label className="flex justify-center items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={sensor.cardVisible !== false}
              onChange={(e) =>
                updateSingleField(sensor.name, "cardVisible", e.target.checked)
              }
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:bg-green-600 relative">
              <div className="w-5 h-5 bg-white rounded-full shadow absolute top-0.5 left-0.5 peer-checked:translate-x-full transition-transform duration-300"></div>
            </div>
          </label>
        </td>
        {/* Status and Uptime/Downtime Column */}
        <td className="p-2 text-right">
          <div className="flex flex-col items-end">
            {/* Online/Offline Status */}
            <div className={`mb-1 px-2 py-1 rounded text-white text-xs font-semibold ${statusColor}`}>
              {status.online ? t('active') : t('inactive')}
            </div>
            
            {/* Uptime (when online) */}
            {status.online && status.uptimeDuration && (
              <div className="text-xs text-green-600 font-medium">
                <span title={t('uptime')}>⏱️ {t('uptime')}: {status.uptimeDuration}</span>
              </div>
            )}
            
            {/* Downtime (when offline) */}
            {!status.online && status.offlineDuration && (
              <div className="text-xs text-red-600 font-medium">
                <span title={t('offline')}>⚠️ {t('offline')}: {status.offlineDuration}</span>
              </div>
            )}
            
            {/* Last seen timestamp */}
            <div className="text-[11px] text-gray-500 mt-1">
              {status.lastSeen
                ? new Date(status.lastSeen).toLocaleString()
                : "–"}
            </div>
          </div>
        </td>
        <td className="p-2 text-right">
          <button
            onClick={() => setShowChart(!showChart)}
            className="text-blue-600 hover:underline text-sm"
          >
            {showChart ? `📉 ${t('hide')}` : `📊 ${t('show')}`}
          </button>
        </td>

        {/* Tlačidlo zmazania */}
        <td className="p-2 text-right">
          <button
            onClick={handleDeleteLocation}
            className="text-red-600 hover:underline text-sm"
            title={t('deleteLocation')}
          >
            🗑️
          </button>
        </td>
      </tr>

      {/* Chart row */}
      {showChart && (
        <tr>
          <td colSpan={7} className="p-3">
            <div className="bg-white p-4 rounded shadow-md">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">
                  📈 {t('uptimeChart')}: {sensor.name}
                </h3>
                <div className="space-x-2">
                  {["24h", "7d", "30d", "365d"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-2 py-1 rounded border ${
                        range === r ? "bg-blue-500 text-white" : "bg-gray-200"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                  <button
                    onClick={downloadCSV}
                    className="ml-4 px-2 py-1 rounded bg-gray-200"
                  >
                    {t('downloadCSV')}
                  </button>
                </div>
              </div>

              {chartError ? (
                <div className="text-center py-4 text-red-500">
                  <p>{chartError}</p>
                  <button 
                    onClick={() => {
                      setChartError(null);
                      api.getSensorHistory(sensor.name, debouncedRange)
                        .then(data => setUptimeData(data))
                        .catch(err => setChartError(err.message));
                    }}
                    className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    {t('retry')}
                  </button>
                </div>
              ) : (
                <div className="timeline-wrapper">
                  <div 
                    ref={timelineRef}
                    className="w-full h-48 relative bg-white border border-gray-200 rounded overflow-hidden cursor-crosshair"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Header with labels */}
                    <div className="absolute top-0 left-0 w-full h-8 bg-gray-50 border-b border-gray-200 flex items-center px-3 text-sm font-medium z-10">
                      <span>{t ? t('status') : "Status"}</span>
                      
                      {/* Show current time at cursor position */}
                      {cursorInfo && (
                        <div className="ml-auto text-xs text-gray-600">
                          {new Date(cursorInfo.time).toLocaleString()} - 
                          <span className={cursorInfo.status === 'online' ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                            {cursorInfo.status === 'online' ? (t ? t('active') : 'Online') : (t ? t('inactive') : 'Offline')}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Timeline area */}
                    <div className="absolute top-8 left-0 right-0 bottom-8 overflow-hidden px-2">
                      {online && online.length > 0 ? (
                        <div className="h-full w-full relative py-4">
                          {/* Background grid lines */}
                          <div className="absolute h-px w-full top-1/3 bg-gray-100"></div>
                          <div className="absolute h-px w-full top-2/3 bg-gray-100"></div>
                          
                          {/* Timeline bar - light gray background */}
                          <div className="absolute top-1/2 left-0 h-4 w-full bg-gray-100 -translate-y-1/2 rounded"></div>
                          
                          {/* Vertical time markers */}
                          {aggregatedData.timeMarkers.map((time, index) => (
                            <div 
                              key={`marker-${index}`}
                              className="absolute top-0 bottom-0 w-px bg-gray-200"
                              style={{ 
                                left: `${((time - online[0].x) / (online[online.length - 1].x - online[0].x)) * 100}%`
                              }}
                            />
                          ))}
                          
                          {/* Online periods - using aggregated data for long ranges */}
                          {range === '30d' || range === '365d' 
                            ? aggregatedData.aggregated.map((segment, index) => {
                                if (!segment.hasData) return null;
                                
                                const totalTime = online[online.length - 1].x - online[0].x;
                                const startPos = ((segment.startTime - online[0].x) / totalTime) * 100;
                                const width = ((segment.endTime - segment.startTime) / totalTime) * 100;
                                
                                // Adjust opacity based on percentage of time online
                                const opacity = 0.3 + (segment.onlinePercentage * 0.7);
                                
                                return (
                                  <div 
                                    key={`segment-${index}`}
                                    className="absolute top-1/2 h-4 bg-green-500 rounded -translate-y-1/2"
                                    style={{ 
                                      left: `${startPos}%`,
                                      width: `${Math.max(0.2, width)}%`,
                                      opacity: opacity
                                    }}
                                    title={`${t ? t('active') : "Online"}: ${Math.round(segment.onlinePercentage * 100)}% of time between ${new Date(segment.startTime).toLocaleString()} - ${new Date(segment.endTime).toLocaleString()}`}
                                  />
                                );
                              })
                            : online.map((point, index) => {
                                // Skip null points
                                if (point.y === null) return null;
                                
                                const nextPoint = online[index + 1];
                                // Skip if no next point
                                if (!nextPoint) return null;
                                
                                // Only show segments where the sensor is online
                                if (point.y !== 1) return null;
                                
                                const duration = nextPoint.x - point.x;
                                const totalTime = online[online.length - 1].x - online[0].x;
                                const widthPercent = (duration / totalTime) * 100;
                                
                                const startPos = ((point.x - online[0].x) / totalTime) * 100;
                                
                                // Format the time for tooltip
                                const startTime = new Date(point.x).toLocaleString();
                                const endTime = new Date(nextPoint.x).toLocaleString();
                                
                                return (
                                  <div 
                                    key={`online-${index}`}
                                    className="absolute top-1/2 h-4 bg-green-500 rounded -translate-y-1/2"
                                    style={{ 
                                      left: `${startPos}%`,
                                      width: `${Math.max(0.2, widthPercent)}%`
                                    }}
                                    title={`${t ? t('active') : "Online"}: ${startTime} - ${endTime}`}
                                  />
                                );
                              })
                          }
                          
                          {/* Cursor line */}
                          {cursorInfo && (
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-blue-500 z-10"
                              style={{ left: cursorInfo.position + 'px' }}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <p className="text-gray-500">{t ? t('noDataForRange') : "Žiadne dáta pre tento rozsah."}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Time axis with more markers */}
                    <div className="absolute h-8 bottom-0 left-0 right-0 border-t border-gray-200 flex items-center px-0 text-xs bg-gray-50">
                      {online && online.length > 0 && aggregatedData.timeMarkers.length > 0 ? (
                        <div className="w-full px-3 relative flex items-center">
                          {aggregatedData.timeMarkers.map((time, index) => (
                            <div 
                              key={`label-${index}`} 
                              className={`absolute text-gray-600 transform -translate-x-1/2 ${index === 0 ? 'text-left' : index === aggregatedData.timeMarkers.length - 1 ? 'text-right' : ''}`}
                              style={{ 
                                left: `${((time - online[0].x) / (online[online.length - 1].x - online[0].x)) * 100}%`
                              }}
                            >
                              {new Date(time).toLocaleString().split(',')[0]}
                              <br />
                              {new Date(time).toLocaleString().split(',')[1]}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-500 px-3">{t ? t('noTimeData') : "No time data available"}</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Enhanced legend with information */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span>{t ? t('active') : "Online"}</span>
                    <span className="ml-2 text-gray-400">({t ? t('blankIsOffline') : "Blank periods are offline"})</span>
                    
                    {range === '30d' || range === '365d' ? (
                      <span className="ml-auto text-gray-500">
                        {t ? t('dataAggregated') : "Data is aggregated"} - {t ? t('opacityShows') : "opacity shows percentage of time online"}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Funkcia generuje stacked data pre graf (Online/Offline). */
function generateStackedData(uptimeData) {
  if (!Array.isArray(uptimeData) || uptimeData.length === 0) {
    console.warn('No data to generate stacked series');
    
    // Return data with at least one valid point to prevent ApexCharts errors
    const now = new Date().getTime();
    return { 
      online: [{ x: now, y: null }],
      offline: [{ x: now, y: null }]
    };
  }

  // Configure intervals and thresholds based on data size and range span
  const dataSize = uptimeData.length;
  // Sort data first to determine time range
  const sortedForSpan = [...uptimeData].sort((a, b) => {
    const timeA = a.timestamp || a._time;
    const timeB = b.timestamp || b._time;
    if (!timeA || !timeB) return 0;
    return new Date(timeA.replace(" ", "T")) - new Date(timeB.replace(" ", "T"));
  });
  
  // If we have valid data, calculate the timespan
  let gapThreshold = 5 * 60 * 1000; // 5 minutes default
  let sampleInterval = 5 * 60 * 1000; // 5 minutes default
  const briefOutageThreshold = 2 * 60 * 1000; // 2 minutes (doesn't change)
  
  if (dataSize > 0 && sortedForSpan.length >= 2) {
    const firstTime = sortedForSpan[0].timestamp || sortedForSpan[0]._time;
    const lastTime = sortedForSpan[sortedForSpan.length-1].timestamp || sortedForSpan[sortedForSpan.length-1]._time;
    
    if (firstTime && lastTime) {
      const start = new Date(firstTime.replace(" ", "T"));
      const end = new Date(lastTime.replace(" ", "T"));
      const timespan = end - start;
      const days = timespan / (1000 * 60 * 60 * 24);
      
      // Adjust parameters based on timespan
      if (days > 300) { // ~365d
        gapThreshold = 24 * 60 * 60 * 1000; // 1 day
        sampleInterval = 6 * 60 * 60 * 1000; // 6 hours
        console.log('365d view detected, using larger gap and sample intervals');
      } else if (days > 20) { // ~30d
        gapThreshold = 6 * 60 * 60 * 1000; // 6 hours
        sampleInterval = 3 * 60 * 60 * 1000; // 3 hours
      } else if (days > 5) { // ~7d
        gapThreshold = 2 * 60 * 60 * 1000; // 2 hours
        sampleInterval = 60 * 60 * 1000; // 1 hour
      }
    }
  }
  
  // Sort data by timestamp to ensure proper sequence
  const sortedData = [...uptimeData].sort((a, b) => {
    const timeA = a.timestamp || a._time;
    const timeB = b.timestamp || b._time;
    if (!timeA || !timeB) return 0;
    return new Date(timeA.replace(" ", "T")) - new Date(timeB.replace(" ", "T"));
  });
  
  // Set up temporary variables
  const onlineSeries = [];
  const offlineSeries = [];
  let previousSampleTime = null;
  let previousStatus = null;
  let lastOnlineTime = null;

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
    const isOnline = point.online !== false;
    
    // Track changes in online status
    if (isOnline && !previousStatus) {
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
    } else if (!isOnline && previousStatus) {
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
    
    // Add the current data point
    onlineSeries.push({ x: currentTime, y: isOnline ? 1 : null });
    offlineSeries.push({ x: currentTime, y: isOnline ? null : 1 });
    
    previousSampleTime = currentTime;
    previousStatus = isOnline;
  }
  
  // Add proper end point if the sensor is currently offline
  const now = Date.now();
  const lastTimepoint = sortedData[sortedData.length - 1];
  const lastTimepointTime = new Date(lastTimepoint.timestamp || lastTimepoint._time).getTime();
  const isOfflineThreshold = 10 * 60 * 1000; // 10 minutes
  
  if (now - lastTimepointTime > isOfflineThreshold) {
    // Sensor is currently offline, add a point to show it
    onlineSeries.push({ x: now, y: null });
    offlineSeries.push({ x: now, y: 1 });
  }
  
  // Ensure we have at least one point to prevent ApexCharts errors
  if (onlineSeries.length === 0) {
    const now = new Date().getTime();
    onlineSeries.push({ x: now, y: null });
    offlineSeries.push({ x: now, y: null });
  }
  
  return { online: onlineSeries, offline: offlineSeries };
}

// Helper function to preprocess 365d data
function preprocessLongRangeData(data) {
  if (!Array.isArray(data) || data.length === 0) return data;
  
  console.log('Preprocessing 365d data, received', data.length, 'records');
  
  // Validate and sort data by timestamp
  const validData = data.filter(point => {
    const timeStr = point.timestamp || point._time;
    return timeStr && !isNaN(new Date(timeStr.replace(" ", "T")).getTime());
  });
  
  if (validData.length === 0) {
    console.error('No valid data points found in 365d data');
    return data; // Return original data if no valid points found
  }
  
  const sortedData = [...validData].sort((a, b) => {
    const timeA = a.timestamp || a._time;
    const timeB = b.timestamp || b._time;
    return new Date(timeA.replace(" ", "T")) - new Date(timeB.replace(" ", "T"));
  });
  
  // Determine time range of the data
  const firstPoint = sortedData[0];
  const lastPoint = sortedData[sortedData.length - 1];
  const firstTime = new Date(firstPoint.timestamp || firstPoint._time);
  const lastTime = new Date(lastPoint.timestamp || lastPoint._time);
  
  console.log('Data time range:', firstTime, 'to', lastTime);
  
  // Calculate optimal sampling rate based on total timespan
  // For 365d, we want around 365-730 data points (1-2 per day)
  const timespan = lastTime - firstTime;
  const days = timespan / (24 * 60 * 60 * 1000);
  const targetPoints = Math.min(Math.max(365, days), 730);
  const samplingRate = Math.max(1, Math.floor(sortedData.length / targetPoints));
  
  console.log('Using sampling rate of 1:', samplingRate, 'for 365d data');
  
  // Initialize data structures for processing
  const processedData = [];
  let currentDay = null;
  let currentDayPoints = [];
  
  // Process data day by day with improved sampling
  for (const point of sortedData) {
    try {
      const timeStr = point.timestamp || point._time;
      if (!timeStr) continue;
      
      const date = new Date(timeStr.replace(" ", "T"));
      if (isNaN(date.getTime())) continue;
      
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      
      // If we've moved to a new day
      if (currentDay !== day) {
        // Process points from previous day if we have any
        if (currentDayPoints.length > 0) {
          // Add first and last point of the day, plus status changes
          if (currentDayPoints.length === 1) {
            processedData.push(currentDayPoints[0]);
          } else {
            // Always include first and last point of the day
            processedData.push(currentDayPoints[0]);
            
            // Add status change points (first checked)
            let prevStatus = currentDayPoints[0].online !== false;
            for (let i = 1; i < currentDayPoints.length - 1; i++) {
              const status = currentDayPoints[i].online !== false;
              if (status !== prevStatus) {
                processedData.push(currentDayPoints[i]);
                prevStatus = status;
              }
            }
            
            // Add last point of day
            processedData.push(currentDayPoints[currentDayPoints.length - 1]);
          }
        }
        
        // Reset for new day
        currentDay = day;
        currentDayPoints = [point];
      } else {
        // Same day, just add the point to the current day's collection
        currentDayPoints.push(point);
      }
    } catch (err) {
      console.error('Error processing point in 365d data:', err);
      // Continue with next point on error
    }
  }
  
  // Process the last day
  if (currentDayPoints.length > 0) {
    if (currentDayPoints.length === 1) {
      processedData.push(currentDayPoints[0]);
    } else {
      // Same logic as in the loop
      processedData.push(currentDayPoints[0]);
      
      let prevStatus = currentDayPoints[0].online !== false;
      for (let i = 1; i < currentDayPoints.length - 1; i++) {
        const status = currentDayPoints[i].online !== false;
        if (status !== prevStatus) {
          processedData.push(currentDayPoints[i]);
          prevStatus = status;
        }
      }
      
      processedData.push(currentDayPoints[currentDayPoints.length - 1]);
    }
  }
  
  // Always include the very last point from original data
  if (sortedData.length > 0) {
    const lastOriginalPoint = sortedData[sortedData.length - 1];
    if (!processedData.includes(lastOriginalPoint)) {
      processedData.push(lastOriginalPoint);
    }
  }
  
  console.log('Preprocessed 365d data from', data.length, 'to', processedData.length, 'points');
  return processedData;
}

/** Format time since in a human readable format */
function formatTimeSince(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return `${seconds}s ago`;
  }
}
