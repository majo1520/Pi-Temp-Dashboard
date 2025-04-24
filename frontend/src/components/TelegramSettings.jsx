import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../services/api';

/**
 * Component for configuring Telegram notification thresholds and settings
 * Includes options for:
 * - Enabling/disabling notifications
 * - Setting chat ID
 * - Configuring notification frequency
 * - Selecting notification language
 * - Toggling inclusion of charts in notifications
 * - Setting thresholds for temperature, humidity, and pressure
 */
const TelegramSettings = ({ t }) => {
  const [telegramSettings, setTelegramSettings] = useState({
    enabled: false,
    chatId: '',
    connected: false,
    notificationFrequency: 30,
    notificationLanguage: 'en',
    sendCharts: true,
    thresholds: {}
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [chatId, setChatId] = useState('');
  const [botConnected, setBotConnected] = useState(false);
  const [notificationFrequency, setNotificationFrequency] = useState(30);
  const [notificationLanguage, setNotificationLanguage] = useState('en');
  const [sendCharts, setSendCharts] = useState(true);
  const [thresholds, setThresholds] = useState({
    temperature: { min: 18, max: 28, enabled: false, thresholdType: 'range' },
    humidity: { min: 30, max: 70, enabled: false, thresholdType: 'range' },
    pressure: { min: 980, max: 1030, enabled: false, thresholdType: 'range' }
  });
  const [selectedLocation, setSelectedLocation] = useState('');
  const [locations, setLocations] = useState([]);
  const [testStatus, setTestStatus] = useState(null);

  // Load locations and settings on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const locationList = await api.getUniqueLocations();
        setLocations(locationList || []);
        if (locationList && locationList.length > 0) {
          setSelectedLocation(locationList[0]);
        }
      } catch (err) {
        setError('Failed to load locations');
        console.error(err);
      }
    };

    const fetchTelegramSettings = async () => {
      setIsLoading(true);
      try {
        const settings = await api.getTelegramSettings();
        setTelegramSettings(settings || {
          enabled: false,
          chatId: '',
          connected: false,
          notificationFrequency: 30,
          notificationLanguage: 'en',
          sendCharts: true,
          thresholds: {}
        });
        setBotConnected(settings?.connected || false);
        setChatId(settings?.chatId || '');
        setNotificationFrequency(settings?.notificationFrequency || 30);
        setNotificationLanguage(settings?.notificationLanguage || 'en');
        setSendCharts(settings?.sendCharts !== undefined ? settings.sendCharts : true);
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching Telegram settings:', err);
        
        // Fallback to default values if API isn't implemented yet
        setTelegramSettings({
          connected: false,
          chatId: '',
          enabled: false,
          notificationFrequency: 30,
          notificationLanguage: 'en',
          sendCharts: true,
          thresholds: {}
        });
        setIsLoading(false);
      }
    };

    fetchLocations();
    fetchTelegramSettings();
  }, []);

  // Update thresholds when location changes
  useEffect(() => {
    if (telegramSettings && selectedLocation) {
      const locationThresholds = telegramSettings.thresholds?.[selectedLocation] || {
        temperature: { min: 18, max: 28, enabled: false, thresholdType: 'range' },
        humidity: { min: 30, max: 70, enabled: false, thresholdType: 'range' },
        pressure: { min: 980, max: 1030, enabled: false, thresholdType: 'range' }
      };
      
      // Ensure no null values are present
      const sanitizedThresholds = {
        temperature: { 
          min: locationThresholds.temperature?.min ?? 18, 
          max: locationThresholds.temperature?.max ?? 28, 
          enabled: locationThresholds.temperature?.enabled ?? false, 
          thresholdType: locationThresholds.temperature?.thresholdType ?? 'range' 
        },
        humidity: { 
          min: locationThresholds.humidity?.min ?? 30, 
          max: locationThresholds.humidity?.max ?? 70, 
          enabled: locationThresholds.humidity?.enabled ?? false, 
          thresholdType: locationThresholds.humidity?.thresholdType ?? 'range' 
        },
        pressure: { 
          min: locationThresholds.pressure?.min ?? 980, 
          max: locationThresholds.pressure?.max ?? 1030, 
          enabled: locationThresholds.pressure?.enabled ?? false, 
          thresholdType: locationThresholds.pressure?.thresholdType ?? 'range' 
        }
      };
      
      setThresholds(sanitizedThresholds);
      setNotificationLanguage(telegramSettings.notificationLanguage || 'en');
    }
  }, [selectedLocation, telegramSettings]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const updatedSettings = await api.updateTelegramSettings({
        chatId: chatId || '',
        enabled: telegramSettings?.enabled ?? false,
        notificationFrequency: notificationFrequency || 30,
        notificationLanguage: notificationLanguage || 'en',
        sendCharts: sendCharts,
        thresholds: {
          ...telegramSettings?.thresholds,
          [selectedLocation]: thresholds
        }
      });
      
      setTelegramSettings(updatedSettings || {
        enabled: false,
        chatId: '',
        connected: false,
        notificationFrequency: 30,
        notificationLanguage: 'en',
        sendCharts: true,
        thresholds: {}
      });
      setIsSaving(false);
      setTestStatus({ success: true, message: t('settingsSaved') || 'Settings saved successfully' });
      setTimeout(() => setTestStatus(null), 3000);
    } catch (err) {
      setError(`Failed to save settings: ${err.message}`);
      setIsSaving(false);
      console.error(err);
    }
  };

  const handleTestNotification = async () => {
    setTestStatus({ loading: true, message: t('sendingTestNotification') || 'Sending test notification...' });
    try {
      const response = await api.testTelegramNotification(chatId || '');
      
      if (response.success) {
        setTestStatus({ success: true, message: t('testNotificationSent') || 'Test notification sent successfully!' });
        setBotConnected(true);
      } else {
        setTestStatus({ error: true, message: response.message || t('failedToSendTest') || 'Failed to send test notification' });
      }
      setTimeout(() => setTestStatus(null), 3000);
    } catch (err) {
      setTestStatus({ error: true, message: err.message || t('failedToSendTest') || 'Failed to send test notification' });
      setTimeout(() => setTestStatus(null), 3000);
      console.error(err);
    }
  };

  const handleThresholdChange = (type, property, value) => {
    setThresholds(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [property]: property === 'enabled' ? !!value : parseFloat(value) || 0
      }
    }));
  };

  const handleThresholdTypeChange = (type, value) => {
    setThresholds(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        thresholdType: value || 'range'
      }
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">
        {t ? t('telegramAlertSettings') : 'Telegram Alert Settings'}
      </h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
          {error}
        </div>
      )}
      
      {testStatus && (
        <div className={`mb-4 p-4 rounded flex items-center ${
          testStatus.success ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200' :
          testStatus.error ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200' :
          'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
        }`}>
          {testStatus.loading && <div className="animate-spin mr-2 rounded-full h-4 w-4 border-b-2 border-current"></div>}
          {testStatus.message}
        </div>
      )}
      
      {/* Global enable/disable toggle for all notifications */}
      <div className={`mb-6 p-4 rounded-lg ${telegramSettings?.enabled ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className={`font-medium ${telegramSettings?.enabled ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
              {telegramSettings?.enabled 
                ? (t ? t('notificationsEnabled') : 'Notifications Enabled') 
                : (t ? t('notificationsDisabled') : 'Notifications Disabled')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t ? t('notificationsToggleDescription') : 'Master switch for all Telegram notifications'}
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={telegramSettings?.enabled ?? false}
              onChange={(e) => setTelegramSettings(prev => ({
                ...prev,
                enabled: e.target.checked
              }))}
              className="sr-only peer"
            />
            <div className="relative w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-500 peer-checked:bg-green-600"></div>
          </label>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">
              {t ? t('botConfiguration') : 'Bot Configuration'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t ? t('telegramChatId') : 'Telegram Chat ID'}
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="123456789"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={handleTestNotification}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-r-md flex items-center"
                    disabled={isSaving}
                  >
                    {t ? t('test') : 'Test'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t ? t('chatIdInstructions') : 'Start a chat with your bot and send /start to get your Chat ID'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t ? t('notificationFrequency') : 'Notification Frequency'}
                </label>
                <select
                  value={notificationFrequency}
                  onChange={(e) => setNotificationFrequency(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="1">{t ? t('every1Minute') : 'Every minute'}</option>
                  <option value="5">{t ? t('every5Minutes') : 'Every 5 minutes'}</option>
                  <option value="15">{t ? t('every15Minutes') : 'Every 15 minutes'}</option>
                  <option value="30">{t ? t('every30Minutes') : 'Every 30 minutes'}</option>
                  <option value="60">{t ? t('everyHour') : 'Every hour'}</option>
                  <option value="120">{t ? t('every2Hours') : 'Every 2 hours'}</option>
                  <option value="360">{t ? t('every6Hours') : 'Every 6 hours'}</option>
                  <option value="720">{t ? t('every12Hours') : 'Every 12 hours'}</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t ? t('notificationFrequencyDescription') : 'How often to check and send notifications'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t ? t('notificationLanguage') : 'Notification Language'}
                </label>
                <select
                  value={notificationLanguage}
                  onChange={(e) => setNotificationLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="en">English</option>
                  <option value="sk">Slovenčina</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t ? t('notificationLanguageDescription') : 'Language for notification messages'}
                </p>
              </div>

              <div className="mt-4">
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <span>{t ? t('sendCharts') : 'Include Charts in Notifications'}</span>
                  <label className="inline-flex items-center cursor-pointer ml-2">
                    <input
                      type="checkbox"
                      checked={sendCharts}
                      onChange={(e) => setSendCharts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                  </label>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t ? t('sendChartsDescription') : 'When enabled, charts with historical data will be included with notifications'}
                </p>
              </div>
              
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${botConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {botConnected ? 
                    (t ? t('botConnected') : 'Bot connected') : 
                    (t ? t('botDisconnected') : 'Bot not connected')}
                </span>
              </div>
            </div>
          </div>
          
          <div className="mt-8">
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex justify-center items-center"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t ? t('saving') : 'Saving...'}
                </>
              ) : (
                t ? t('saveSettings') : 'Save Settings'
              )}
            </button>
          </div>
        </div>
        
        <div>
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">
              {t ? t('thresholdSettings') : 'Threshold Settings'}
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t ? t('selectLocation') : 'Select Location'}
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {locations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-6">
              {/* Temperature thresholds */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">
                    {t ? t('temperature') : 'Temperature'} (°C)
                  </h4>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={thresholds.temperature.enabled}
                      onChange={(e) => handleThresholdChange('temperature', 'enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                {/* Threshold type selector */}
                {thresholds.temperature.enabled && (
                  <div className="mb-3">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t ? t('thresholdType') : 'Threshold Type'}:</span>
                      <div className="flex space-x-4">
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name="temperatureThresholdType"
                            checked={thresholds.temperature.thresholdType === 'range'}
                            onChange={() => handleThresholdTypeChange('temperature', 'range')}
                            className="form-radio h-4 w-4 text-blue-600"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t ? t('rangeThreshold') : 'Value outside range'}
                          </span>
                        </label>
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name="temperatureThresholdType"
                            checked={thresholds.temperature.thresholdType === 'max'}
                            onChange={() => handleThresholdTypeChange('temperature', 'max')}
                            className="form-radio h-4 w-4 text-blue-600"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t ? t('maxOnlyThreshold') : 'Value exceeds threshold'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {thresholds.temperature.thresholdType === 'range' && (
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {t ? t('minimum') : 'Minimum'}
                      </label>
                      <input
                        type="number"
                        value={thresholds.temperature.min}
                        onChange={(e) => handleThresholdChange('temperature', 'min', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        disabled={!thresholds.temperature.enabled}
                      />
                    </div>
                  )}
                  <div className={thresholds.temperature.thresholdType === 'max' ? 'col-span-2' : ''}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t ? t('maximum') : 'Maximum'}
                    </label>
                    <input
                      type="number"
                      value={thresholds.temperature.max}
                      onChange={(e) => handleThresholdChange('temperature', 'max', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      disabled={!thresholds.temperature.enabled}
                    />
                  </div>
                </div>
              </div>
              
              {/* Humidity thresholds */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">
                    {t ? t('humidity') : 'Humidity'} (%)
                  </h4>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={thresholds.humidity.enabled}
                      onChange={(e) => handleThresholdChange('humidity', 'enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                {/* Threshold type selector */}
                {thresholds.humidity.enabled && (
                  <div className="mb-3">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t ? t('thresholdType') : 'Threshold Type'}:</span>
                      <div className="flex space-x-4">
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name="humidityThresholdType"
                            checked={thresholds.humidity.thresholdType === 'range'}
                            onChange={() => handleThresholdTypeChange('humidity', 'range')}
                            className="form-radio h-4 w-4 text-blue-600"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t ? t('rangeThreshold') : 'Value outside range'}
                          </span>
                        </label>
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name="humidityThresholdType"
                            checked={thresholds.humidity.thresholdType === 'max'}
                            onChange={() => handleThresholdTypeChange('humidity', 'max')}
                            className="form-radio h-4 w-4 text-blue-600"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t ? t('maxOnlyThreshold') : 'Value exceeds threshold'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {thresholds.humidity.thresholdType === 'range' && (
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {t ? t('minimum') : 'Minimum'}
                      </label>
                      <input
                        type="number"
                        value={thresholds.humidity.min}
                        onChange={(e) => handleThresholdChange('humidity', 'min', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        disabled={!thresholds.humidity.enabled}
                      />
                    </div>
                  )}
                  <div className={thresholds.humidity.thresholdType === 'max' ? 'col-span-2' : ''}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t ? t('maximum') : 'Maximum'}
                    </label>
                    <input
                      type="number"
                      value={thresholds.humidity.max}
                      onChange={(e) => handleThresholdChange('humidity', 'max', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      disabled={!thresholds.humidity.enabled}
                    />
                  </div>
                </div>
              </div>
              
              {/* Pressure thresholds */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">
                    {t ? t('pressure') : 'Pressure'} (hPa)
                  </h4>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={thresholds.pressure.enabled}
                      onChange={(e) => handleThresholdChange('pressure', 'enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                {/* Threshold type selector */}
                {thresholds.pressure.enabled && (
                  <div className="mb-3">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t ? t('thresholdType') : 'Threshold Type'}:</span>
                      <div className="flex space-x-4">
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name="pressureThresholdType"
                            checked={thresholds.pressure.thresholdType === 'range'}
                            onChange={() => handleThresholdTypeChange('pressure', 'range')}
                            className="form-radio h-4 w-4 text-blue-600"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t ? t('rangeThreshold') : 'Value outside range'}
                          </span>
                        </label>
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            name="pressureThresholdType"
                            checked={thresholds.pressure.thresholdType === 'max'}
                            onChange={() => handleThresholdTypeChange('pressure', 'max')}
                            className="form-radio h-4 w-4 text-blue-600"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            {t ? t('maxOnlyThreshold') : 'Value exceeds threshold'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {thresholds.pressure.thresholdType === 'range' && (
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {t ? t('minimum') : 'Minimum'}
                      </label>
                      <input
                        type="number"
                        value={thresholds.pressure.min}
                        onChange={(e) => handleThresholdChange('pressure', 'min', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        disabled={!thresholds.pressure.enabled}
                      />
                    </div>
                  )}
                  <div className={thresholds.pressure.thresholdType === 'max' ? 'col-span-2' : ''}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t ? t('maximum') : 'Maximum'}
                    </label>
                    <input
                      type="number"
                      value={thresholds.pressure.max}
                      onChange={(e) => handleThresholdChange('pressure', 'max', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      disabled={!thresholds.pressure.enabled}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-6 text-sm text-gray-500 dark:text-gray-400 border-t pt-4 dark:border-gray-700">
        <p>
          {t ? t('telegramNotificationsInfo') : 'Notifications will be sent when values go outside the specified ranges. Set up a Telegram bot for notifications.'}
        </p>
        <p className="mt-2">
          <a 
            href="https://core.telegram.org/bots#how-do-i-create-a-bot" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {t ? t('howToCreateBot') : 'How to create a Telegram bot'}
          </a>
        </p>
      </div>
    </div>
  );
};

export default TelegramSettings; 