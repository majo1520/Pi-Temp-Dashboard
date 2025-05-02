import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExportPanel from './ExportPanel';
import ImportPanel from './ImportPanel';
import UsersManagement from './UsersManagement';
import * as api from '../services/api';

/**
 * Admin Sidebar component for the Admin panel
 */
function AdminSidebar({ onReloadSensors, sensors, onAddLocation, excludeSettings = false, onHideLocation, onToggleUsersManagement, onToggleTelegramSettings }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [newLocation, setNewLocation] = useState("");
  
  // Initialize hiddenLocations from localStorage to avoid unnecessary updates
  const [hiddenLocations, setHiddenLocations] = useState(() => {
    try {
      const storedHiddenLocations = localStorage.getItem('hiddenLocations');
      return storedHiddenLocations ? JSON.parse(storedHiddenLocations) : [];
    } catch (e) {
      console.error("Error parsing hidden locations:", e);
      return [];
    }
  });
  
  const [locationOrder, setLocationOrder] = useState([]);
  
  // Track expanded sections with localStorage persistence
  const [expandedSections, setExpandedSections] = useState(() => {
    // Try to load from localStorage on initial render
    const storedSections = localStorage.getItem('adminSidebarSections');
    if (storedSections) {
      try {
        return JSON.parse(storedSections);
      } catch (e) {
        console.error("Error parsing stored sidebar sections:", e);
      }
    }
    // Default state if nothing in localStorage
    return {
      export: false,
      addLocation: false,
      import: false,
      help: false,
      manageSensors: false,
      usersManagement: false,
      telegramSettings: false
    };
  });
  
  // Load hidden locations on first render
  useEffect(() => {
    // Load custom location order
    const storedLocationOrder = localStorage.getItem('locationOrder');
    if (storedLocationOrder) {
      try {
        setLocationOrder(JSON.parse(storedLocationOrder));
      } catch (e) {
        console.error("Error parsing location order:", e);
      }
    }
  }, []);
  
  // Add a new effect to initialize location order based on sensors
  useEffect(() => {
    // Initialize location order if it's empty and we have sensors
    if (locationOrder.length === 0 && sensors.length > 0) {
      const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
      if (allLocations.length > 0) {
        setLocationOrder(allLocations);
      }
    }
  }, [sensors, locationOrder]);
  
  // Save hidden locations when they change
  useEffect(() => {
    localStorage.setItem('hiddenLocations', JSON.stringify(hiddenLocations));
  }, [hiddenLocations]);
  
  // Save location order when it changes
  useEffect(() => {
    localStorage.setItem('locationOrder', JSON.stringify(locationOrder));
  }, [locationOrder]);
  
  // Save expanded sections when they change
  useEffect(() => {
    console.log("Saving sidebar sections:", expandedSections);
    localStorage.setItem('adminSidebarSections', JSON.stringify(expandedSections));
  }, [expandedSections]);
  
  // Toggle a section's expanded state
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Toggle location visibility in admin dashboard
  const toggleLocationVisibility = (location) => {
    setHiddenLocations(prev => {
      const isCurrentlyHidden = prev.includes(location);
      const newHiddenLocations = isCurrentlyHidden 
        ? prev.filter(loc => loc !== location)
        : [...prev, location];
      
      console.log(`Toggling location visibility for "${location}". New state:`, 
                 isCurrentlyHidden ? "visible" : "hidden", 
                 "Full hidden list:", newHiddenLocations);
      
      // Directly save to localStorage for redundancy
      localStorage.setItem('hiddenLocations', JSON.stringify(newHiddenLocations));
      
      return newHiddenLocations;
    });
  };
  
  // Use effect to notify parent component when hiddenLocations change
  useEffect(() => {
    // Only call the parent callback if hiddenLocations has been initialized
    // and we're not in the initial render
    if (hiddenLocations.length || onHideLocation) {
      // Callback to parent component to handle UI update
      onHideLocation?.(hiddenLocations);
    }
  }, [hiddenLocations, onHideLocation]);
  
  // Move a location up in the order
  const moveLocationUp = (location) => {
    setLocationOrder(prev => {
      // If location isn't in order yet, initialize the order first
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
      // If location isn't in order yet, initialize the order first
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
  
  const handleLogout = () => {
    api.logout()
      .then(() => navigate("/login"))
      .catch(err => console.error("Error logging out:", err));
  };
  
  const handleAddLocation = () => {
    if (!newLocation) return;
    onAddLocation(newLocation);
    setNewLocation("");
  };
  
  return (
    <aside
      className="w-56 flex flex-col dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
      style={{ height: "100vh" }}
    >
      <div className="flex items-center justify-center py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-medium text-gray-800 dark:text-white">{t('adminPanelTitle')}</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {/* Navigation Actions */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center p-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 mb-2 text-left"
          >
            <span className="text-base mr-3">🏠</span>
            <span className="text-sm">{t('dashboardTitle')}</span>
          </button>
          
          <button
            onClick={onReloadSensors}
            className="w-full flex items-center p-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 mb-2 text-left"
          >
            <span className="text-base mr-3">🔄</span>
            <span className="text-sm">{t('refresh')}</span>
          </button>
          
          <button
            onClick={onToggleUsersManagement}
            className="w-full flex items-center p-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 mb-2 text-left"
          >
            <span className="text-base mr-3">👥</span>
            <span className="text-sm">{t('toggleUsersView') || 'Toggle Users View'}</span>
          </button>
          
          <button
            onClick={onToggleTelegramSettings}
            className="w-full flex items-center p-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 mb-2 text-left"
          >
            <span className="text-base mr-3">🔔</span>
            <span className="text-sm">{t('telegramAlerts') || 'Telegram Alerts'}</span>
          </button>
          
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'sk' ? 'en' : 'sk')}
            className="w-full flex items-center p-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 mb-2 text-left"
          >
            <span className="text-base mr-3">🌍</span>
            <span className="text-sm">{i18n.language === 'sk' ? 'SK / EN' : 'EN / SK'}</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center p-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
          >
            <span className="text-base mr-3">🚪</span>
            <span className="text-sm">{t('logout')}</span>
          </button>
        </div>
        
        {/* Export Data Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.export ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('export')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">📤</span>
              <span className="font-medium text-sm">{t('exportData')}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.export ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.export && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <ExportPanel t={t} />
            </div>
          )}
        </div>
        
        {/* Add Location Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.addLocation ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('addLocation')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">➕</span>
              <span className="font-medium text-sm">{t('addNewLocation')}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.addLocation ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.addLocation && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700" style={{ textAlign: 'left' }}>
              <div style={{ textAlign: 'left' }}>
                <label className="block text-sm font-medium mb-1 text-left" style={{ textAlign: 'left' }}>{t('locationName')}:</label>
                <div className="flex flex-col space-y-2">
                  <input
                    type="text"
                    placeholder={t('locationName')}
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1 text-sm text-left"
                  />
                  <button
                    onClick={handleAddLocation}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded shadow text-sm"
                    data-action="add-location"
                  >
                    {t('add')}
                  </button>
                  <div data-container="add-location-messages"></div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Import Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.import ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('import')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">📥</span>
              <span className="font-medium text-sm">{t('importTitle')}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.import ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.import && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700" style={{ textAlign: 'left' }}>
              <ImportPanel sensors={sensors} onImportDone={onReloadSensors} t={t} />
            </div>
          )}
        </div>
        
        {/* Manage Sensors Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.manageSensors ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('manageSensors')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">🔍</span>
              <span className="font-medium text-sm">{t('manageSensors') || "Správa senzorov"}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.manageSensors ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.manageSensors && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">{t('manageLocationsVisibility') || "Správa viditeľnosti lokalít"}</h4>
                  
                  {/* Get unique locations from sensors and sort by custom order */}
                  {(() => {
                    let allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
                    
                    // Sort locations based on custom order (no initialization here)
                    if (locationOrder.length > 0) {
                      allLocations.sort((a, b) => {
                        const indexA = locationOrder.indexOf(a);
                        const indexB = locationOrder.indexOf(b);
                        
                        // Handle cases where location might not be in the order yet
                        if (indexA === -1 && indexB === -1) return 0;
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        
                        return indexA - indexB;
                      });
                    }
                    
                    return allLocations.length > 0 ? (
                      <div className="space-y-2">
                        {allLocations.map(location => (
                          <div key={`dashboard-loc-${location}`} className="flex justify-between items-center text-sm border-b pb-2 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                <button
                                  onClick={() => moveLocationUp(location)}
                                  className="text-gray-500 hover:text-blue-500 text-xs"
                                  title={t ? t('moveUp') : "Posunúť hore"}
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => moveLocationDown(location)}
                                  className="text-gray-500 hover:text-blue-500 text-xs"
                                  title={t ? t('moveDown') : "Posunúť dole"}
                                >
                                  ▼
                                </button>
                              </div>
                              <span>{location}</span>
                            </div>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={!hiddenLocations.includes(location)}
                                onChange={() => toggleLocationVisibility(location)}
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 relative">
                                <div className="w-4 h-4 bg-white rounded-full shadow absolute top-0.5 left-0.5 peer-checked:translate-x-full transition-transform duration-300"></div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">{t('noLocationsFound') || "Žiadne lokality neboli nájdené"}</p>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Users Management Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.usersManagement ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('usersManagement')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">👥</span>
              <span className="font-medium text-sm">{t('userManagement') || "Manage Users"}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.usersManagement ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.usersManagement && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="mb-3">
                <button
                  onClick={onToggleUsersManagement}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center text-sm"
                >
                  <span className="mr-1">↗️</span>
                  <span>{t('showInMainView') || 'Show in Main View'}</span>
                </button>
              </div>
              <UsersManagement t={t} isCompact={true} />
            </div>
          )}
        </div>
        
        {/* Telegram Settings Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.telegramSettings ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('telegramSettings')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">🔔</span>
              <span className="font-medium text-sm">{t('telegramAlerts') || "Telegram Alerts"}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.telegramSettings ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.telegramSettings && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="mb-3">
                <button
                  onClick={onToggleTelegramSettings}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center text-sm"
                >
                  <span className="mr-1">↗️</span>
                  <span>{t('showInMainView') || 'Show in Main View'}</span>
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('telegramNotificationsInfo') || 'Configure Telegram notifications for your sensors.'}
              </p>
            </div>
          )}
        </div>
        
        {/* Help Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button 
            className={`w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${expandedSections.help ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => toggleSection('help')}
          >
            <div className="flex items-center text-left">
              <span className="text-base mr-3">❓</span>
              <span className="font-medium text-sm">{t('help')}</span>
            </div>
            <span className="text-gray-500 transform transition-transform duration-200">{expandedSections.help ? '▼' : '▶'}</span>
          </button>
          
          {expandedSections.help && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <div>
                  <h4 className="font-semibold mb-1">{t('sensorName')}</h4>
                  <p>{t('chartsHelpText')}</p>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-1">{t('cards')}</h4>
                  <p>{t('thresholdsHelpText')}</p>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-1">{t('exportData')}</h4>
                  <p>{t('heatmapHelpText')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default AdminSidebar;