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
function AdminSidebar({ 
  isOpen = true,
  onReloadSensors = () => {},
  sensors = [], 
  onAddLocation = () => {}, 
  excludeSettings = false, 
  onHideLocation = () => {}, 
  onToggleUsersManagement = () => {}, 
  onToggleTelegramSettings = () => {},
  onToggleSystemMonitoring = () => {},
  onToggleSensorManagement = () => {}
}) {
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
      telegramSettings: false,
      systemMonitoring: false
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
    if (locationOrder.length === 0 && Array.isArray(sensors) && sensors.length > 0) {
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
        const allLocations = Array.isArray(sensors) && sensors.length > 0 
          ? [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))]
          : [];
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
        const allLocations = Array.isArray(sensors) && sensors.length > 0 
          ? [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))]
          : [];
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
      className={`w-56 flex flex-col dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all overflow-y-auto ${isOpen ? '' : 'w-0 -ml-56 opacity-0'}`}
      style={{ height: "100vh" }}
    >
      <div className="flex items-center justify-center py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-medium text-gray-800 dark:text-white">{t('adminPanelTitle')}</h2>
      </div>
      
        {/* Navigation Actions */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-7-7v14" />
                </svg>
              </span>
              <span onClick={() => navigate("/")} className="text-sm cursor-pointer">{t('dashboardTitle')}</span>
            </div>
            <button 
              onClick={() => navigate("/")}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        {/* Sensor Management button directly under T-monitor navigation */}
        <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
          <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </span>
            <span onClick={onToggleSensorManagement} className="text-sm cursor-pointer">{t('manageSensors') || 'Manage Sensors'}</span>
          </div>
          <button 
            onClick={onToggleSensorManagement}
            className="bg-blue-600 text-white rounded p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
          
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
              <span onClick={onToggleSystemMonitoring} className="text-sm cursor-pointer">{t('systemHealth') || 'System Health'}</span>
            </div>
            <button 
              onClick={onToggleSystemMonitoring}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </span>
            <span onClick={onToggleTelegramSettings} className="text-sm cursor-pointer">{t('telegramAlerts') || 'Telegram Alerts'}</span>
            </div>
            <button 
            onClick={onToggleTelegramSettings}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </span>
              <span onClick={onToggleUsersManagement} className="text-sm cursor-pointer">{t('userManagement')}</span>
            </div>
            <button 
              onClick={onToggleUsersManagement}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </span>
            <span onClick={onReloadSensors} className="text-sm cursor-pointer">{t('refresh') || 'Refresh'}</span>
            </div>
            <button 
            onClick={onReloadSensors}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              </span>
              <span onClick={() => i18n.changeLanguage(i18n.language === 'sk' ? 'en' : 'sk')} className="text-sm cursor-pointer">{t('language')}</span>
            </div>
            <button 
              onClick={() => i18n.changeLanguage(i18n.language === 'sk' ? 'en' : 'sk')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center justify-between p-2 hover:bg-red-50 text-red-600 rounded mb-2">
            <div className="flex items-center">
              <span className="mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </span>
              <span onClick={handleLogout} className="text-sm cursor-pointer">{t('logout')}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="bg-red-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Export Data Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
              <span className="font-medium text-sm">{t('exportData')}</span>
            </div>
            <button 
              onClick={() => toggleSection('export')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          {expandedSections.export && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <ExportPanel t={t} />
            </div>
          )}
        </div>
        
        {/* Add Location Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </span>
              <span className="font-medium text-sm">{t('addNewLocation')}</span>
            </div>
            <button 
              onClick={() => toggleSection('addLocation')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
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
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </span>
              <span className="font-medium text-sm">{t('importTitle')}</span>
            </div>
            <button 
              onClick={() => toggleSection('import')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          {expandedSections.import && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700" style={{ textAlign: 'left' }}>
              <ImportPanel sensors={sensors} onImportDone={onReloadSensors} t={t} />
            </div>
          )}
        </div>
        
      {/* Manage Locations Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <span className="font-medium text-sm">{t('manageLocations')}</span>
            </div>
            <button 
              onClick={() => toggleSection('manageSensors')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
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
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </span>
              <span className="font-medium text-sm">{t('userManagement') || "Manage Users"}</span>
            </div>
            <button 
              onClick={() => toggleSection('usersManagement')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
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
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </span>
              <span className="font-medium text-sm">{t('telegramAlerts') || "Telegram Alerts"}</span>
            </div>
            <button 
              onClick={() => toggleSection('telegramSettings')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
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
          <div className="flex items-center justify-between p-2 hover:bg-gray-100 text-gray-700">
            <div className="flex items-center">
            <span className="mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
              <span className="font-medium text-sm">{t('help')}</span>
            </div>
            <button 
              onClick={() => toggleSection('help')}
              className="bg-blue-600 text-white rounded p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
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
    </aside>
  );
}

export default AdminSidebar;