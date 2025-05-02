// Telegram notifications route module
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createCanvas } = require('canvas');
const { notificationSettings } = require('../db.cjs');
const logger = require('../utils/logger');
const telegramChart = require('../telegram-chart.cjs');

// Ensure the temp directory exists
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Generate a temp file path for charts
const generateTempFilePath = (ext) => {
  const rand = crypto.randomBytes(16).toString('hex');
  return path.join(tempDir, `chart-${rand}.${ext}`);
};

// Middleware to ensure a user is authenticated
function ensureAuthenticated(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required',
      message: 'You must be logged in to access notification settings'
    });
  }
  next();
}

// Get Telegram settings
router.get('/settings', ensureAuthenticated, async (req, res) => {
  try {
    // Get the user ID from the session
    const userId = req.session.user.id;
    
    // Get all notification settings for the user
    const settings = await notificationSettings.getUserSettings(userId);
    
    // Format the settings to return with explicit boolean conversions
    const formattedSettings = {
      chatId: settings.length > 0 ? settings[0].chat_id : '',
      connected: settings.length > 0 && !!settings[0].chat_id,
      enabled: settings.length > 0 ? settings[0].enabled === 1 : false,
      notificationFrequency: settings.length > 0 ? settings[0].notification_frequency_minutes : 30,
      notificationLanguage: settings.length > 0 ? settings[0].notification_language : 'en',
      sendCharts: settings.length > 0 ? settings[0].send_charts === 1 : true,
      thresholds: {}
    };
    
    // Group by location with explicit boolean conversions
    for (const setting of settings) {
      // Ensure threshold types have valid values
      const validateThresholdType = (type) => {
        return (type === 'range' || type === 'max') ? type : 'range';
      };
      
      // Add this location to the thresholds with validated types and explicit boolean conversions
      formattedSettings.thresholds[setting.location] = {
        temperature: {
          enabled: setting.temperature_enabled === 1,
          min: setting.temperature_min,
          max: setting.temperature_max,
          thresholdType: validateThresholdType(setting.temperature_threshold_type)
        },
        humidity: {
          enabled: setting.humidity_enabled === 1,
          min: setting.humidity_min,
          max: setting.humidity_max,
          thresholdType: validateThresholdType(setting.humidity_threshold_type)
        },
        pressure: {
          enabled: setting.pressure_enabled === 1,
          min: setting.pressure_min,
          max: setting.pressure_max,
          thresholdType: validateThresholdType(setting.pressure_threshold_type)
        },
        offlineNotificationsEnabled: setting.offline_notification_enabled === 1
      };
    }
    
    res.json(formattedSettings);
  } catch (error) {
    console.error('Error getting Telegram settings:', error);
    res.status(500).json({ error: error.message || 'Failed to get Telegram settings' });
  }
});

// Update Telegram settings
router.post('/settings', ensureAuthenticated, async (req, res) => {
  try {
    // Extract settings from request body
    const {
      chatId,
      enabled,
      thresholds,
      notificationFrequency,
      notificationLanguage,
      sendCharts
    } = req.body;
    
    if (!thresholds) {
      return res.status(400).json({ error: 'Thresholds are required' });
    }
    
    // Get the user ID from the session
    const userId = req.session.user.id;
    
    // Process each location from the thresholds
    const updatePromises = Object.keys(thresholds).map(async (location) => {
      const locationThresholds = thresholds[location];
      
      // Ensure offlineNotificationsEnabled is stored as either 0 or 1
      if (locationThresholds.offlineNotificationsEnabled !== undefined) {
        // Ensure it's stored as a number (0 or 1)
        const numericValue = locationThresholds.offlineNotificationsEnabled === 1 || 
                            locationThresholds.offlineNotificationsEnabled === true ? 1 : 0;
        
        // Force the value to be numeric for storage
        locationThresholds.offlineNotificationsEnabled = numericValue;
      }
      
      // Process threshold types to ensure they are valid
      const validateThresholdType = (type) => {
        // Only allow 'range' or 'max' as valid types
        return (type === 'range' || type === 'max') ? type : 'range';
      };
      
      // Get threshold types with validation
      const temperatureThresholdType = validateThresholdType(
        locationThresholds.temperature?.thresholdType
      );
      
      const humidityThresholdType = validateThresholdType(
        locationThresholds.humidity?.thresholdType
      );
      
      const pressureThresholdType = validateThresholdType(
        locationThresholds.pressure?.thresholdType
      );
      
      // Update settings for this location with special care for threshold types
      return notificationSettings.updateSettings(userId, location, {
        chat_id: chatId,
        enabled: enabled,
        notification_frequency_minutes: notificationFrequency,
        notification_language: notificationLanguage,
        send_charts: sendCharts,
        // Thresholds and offline notification settings - using correct column names
        temperature_enabled: locationThresholds.temperature?.enabled || false,
        temperature_min: locationThresholds.temperature?.min,
        temperature_max: locationThresholds.temperature?.max,
        temperature_threshold_type: temperatureThresholdType,
        humidity_enabled: locationThresholds.humidity?.enabled || false,
        humidity_min: locationThresholds.humidity?.min,
        humidity_max: locationThresholds.humidity?.max,
        humidity_threshold_type: humidityThresholdType,
        pressure_enabled: locationThresholds.pressure?.enabled || false,
        pressure_min: locationThresholds.pressure?.min,
        pressure_max: locationThresholds.pressure?.max,
        pressure_threshold_type: pressureThresholdType,
        offline_notification_enabled: locationThresholds.offlineNotificationsEnabled
      });
    });
    
    // Wait for all settings to be updated
    await Promise.all(updatePromises);
    
    // Get updated settings
    const updatedDbSettings = await notificationSettings.getUserSettings(userId);
    
    // Format the settings to return to the frontend with proper boolean conversions
    const formattedSettings = {
      chatId: updatedDbSettings.length > 0 ? updatedDbSettings[0].chat_id : '',
      connected: updatedDbSettings.length > 0 && !!updatedDbSettings[0].chat_id,
      enabled: updatedDbSettings.length > 0 ? updatedDbSettings[0].enabled === 1 : false,
      notificationFrequency: updatedDbSettings.length > 0 ? updatedDbSettings[0].notification_frequency_minutes : 30,
      notificationLanguage: updatedDbSettings.length > 0 ? updatedDbSettings[0].notification_language : 'en',
      sendCharts: updatedDbSettings.length > 0 ? updatedDbSettings[0].send_charts === 1 : true,
      thresholds: {}
    };
    
    // Group by location with proper boolean conversions
    for (const setting of updatedDbSettings) {
      // Properly convert numeric values to booleans
      formattedSettings.thresholds[setting.location] = {
        temperature: {
          enabled: setting.temperature_enabled === 1,
          min: setting.temperature_min,
          max: setting.temperature_max,
          thresholdType: setting.temperature_threshold_type || 'range'
        },
        humidity: {
          enabled: setting.humidity_enabled === 1,
          min: setting.humidity_min,
          max: setting.humidity_max,
          thresholdType: setting.humidity_threshold_type || 'range'
        },
        pressure: {
          enabled: setting.pressure_enabled === 1,
          min: setting.pressure_min,
          max: setting.pressure_max,
          thresholdType: setting.pressure_threshold_type || 'range'
        },
        offlineNotificationsEnabled: setting.offline_notification_enabled === 1
      };
    }
    
    res.json(formattedSettings);
  } catch (error) {
    console.error('Error updating Telegram settings:', error);
    res.status(500).json({ error: error.message || 'Failed to update Telegram settings' });
  }
});

// Send test notification
router.post('/test', ensureAuthenticated, async (req, res) => {
  try {
    const { chatId, notificationLanguage = 'en' } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Chat ID is required' 
      });
    }
    
    // Use the Telegram Bot API to send a message
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ 
        success: false, 
        message: 'Telegram bot token not configured' 
      });
    }
    
    // Prepare message based on language
    let testMessage = 'This is a test notification from your IoT Sensor Dashboard.';
    if (notificationLanguage === 'sk') {
      testMessage = 'Toto je testovacie upozornenie z vášho IoT Sensor Dashboard.';
    }
    
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
      method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: testMessage,
        }),
      }
    );
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(400).json({ 
        success: false, 
        message: `Failed to send test message: ${data.description}` 
      });
    }
    
    // Get the user ID from the session
    const userId = req.session.user.id;
    
    // Update the chat ID for all locations for this user
    await notificationSettings.updateChatId(userId, chatId);
    
    // If notification language was provided, update it
    if (notificationLanguage) {
      await notificationSettings.updateLanguage(userId, notificationLanguage);
    }
    
    res.json({ 
      success: true, 
      message: 'Test notification sent successfully' 
    });
  } catch (error) {
    logger.error('Error sending test Telegram notification:', error);
    res.status(500).json({ 
      success: false, 
      message: `Server error while sending test notification: ${error.message}` 
    });
  }
});

// Send notification when thresholds are exceeded
router.post('/notify', ensureAuthenticated, async (req, res) => {
  try {
    const { location, temperature, humidity, pressure, thresholds, notificationLanguage = 'en' } = req.body;

    if (!location || !thresholds || temperature === undefined || humidity === undefined || pressure === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    // Get the user ID from the session
    const userId = req.session.user.id;
    
    // Get notification settings for this user
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }
    
    // Get the chat ID from the first setting (all settings should have the same chat ID)
    const chatId = userSettings[0].chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Get preferred notification language (fallback to English)
    const lang = notificationLanguage || userSettings[0].notification_language || 'en';

    // Format the notification text based on language
    const messages = [];
    
    if (temperature !== undefined && thresholds.temperature?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.temperature.thresholdType || 'range';
      
      if (thresholdType === 'range' && (temperature < thresholds.temperature.min || temperature > thresholds.temperature.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota je ${temperature}°C (mimo rozsah ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature is ${temperature}°C (outside range ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) at ${location}`);
        }
      } else if (thresholdType === 'max' && temperature >= thresholds.temperature.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota dosiahla ${temperature}°C (prekročila cieľovú hodnotu ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature reached ${temperature}°C (exceeded target value ${thresholds.temperature.max}°C) at ${location}`);
        }
      }
    }
    
    if (humidity !== undefined && thresholds.humidity?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.humidity.thresholdType || 'range';
      
      if (thresholdType === 'range' && (humidity < thresholds.humidity.min || humidity > thresholds.humidity.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť je ${humidity}% (mimo rozsah ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity is ${humidity}% (outside range ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) at ${location}`);
        }
      } else if (thresholdType === 'max' && humidity >= thresholds.humidity.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť dosiahla ${humidity}% (prekročila cieľovú hodnotu ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity reached ${humidity}% (exceeded target value ${thresholds.humidity.max}%) at ${location}`);
        }
      }
    }
    
    if (pressure !== undefined && thresholds.pressure?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.pressure.thresholdType || 'range';
      
      if (thresholdType === 'range' && (pressure < thresholds.pressure.min || pressure > thresholds.pressure.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🧭 Tlak je ${pressure} hPa (mimo rozsah ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure is ${pressure} hPa (outside range ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) at ${location}`);
        }
      } else if (thresholdType === 'max' && pressure >= thresholds.pressure.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🧭 Tlak dosiahol ${pressure} hPa (prekročil cieľovú hodnotu ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure reached ${pressure} hPa (exceeded target value ${thresholds.pressure.max} hPa) at ${location}`);
        }
      }
    }
    
    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: lang === 'sk' ? 'Neboli zistené žiadne porušenia limitov ani dosiahnuté cieľové hodnoty' : 'No threshold violations or target values detected'
      });
    }
    
    const text = messages.join('\n');
    
    // Send the notification
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        chat_id: chatId,
        text: text,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(500).json({
        success: false,
        message: lang === 'sk' 
          ? `Nepodarilo sa odoslať upozornenie: ${data.description}` 
          : `Failed to send notification: ${data.description}`
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: lang === 'sk' ? 'Upozornenie úspešne odoslané' : 'Notification sent successfully',
      telegram: data 
    });
  } catch (error) {
    logger.error('Error sending Telegram notification:', error);
    const errorLang = req.body?.notificationLanguage || 'en';
    res.status(500).json({
      success: false,
      message: errorLang === 'sk' 
        ? `Chyba servera pri odosielaní upozornenia: ${error.message}` 
        : `Server error while sending notification: ${error.message}`
    });
  }
});

// Route to send chart
router.post('/chart', ensureAuthenticated, async (req, res) => {
  try {
    const { location, type, timeRangeMinutes, language } = req.body;

    if (!location || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: location and type'
      });
    }

    // Validate type
    const validTypes = ['temperature', 'humidity', 'pressure'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Get the user ID from the session
    const userId = req.session.user.id;
    
    // Get notification settings for this user to get the chat ID
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram settings not found'
      });
    }
    
    // Get the chat ID from the first setting (all settings should have the same chat ID)
    const chatId = userSettings[0].chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    // Check if Telegram bot token is configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Set options for chart generation
    const options = {
      timeRangeMinutes: timeRangeMinutes || 60,
      language: language || userSettings[0].notification_language || 'en'
    };

    // Generate and send chart
    const result = await telegramChart.sendSensorChart(chatId, location, type, options);

    return res.status(200).json({
      success: true,
      message: `Chart sent successfully for ${location} - ${type}`,
      telegram: result
    });
  } catch (error) {
    logger.error('Error sending chart via Telegram:', error);
    res.status(500).json({
      success: false,
      message: `Error sending chart: ${error.message}`
    });
  }
});

// Send notification with charts
router.post('/notify-with-chart', ensureAuthenticated, async (req, res) => {
  try {
    const { location, temperature, humidity, pressure, thresholds, notificationLanguage = 'en' } = req.body;

    if (!location || !thresholds || temperature === undefined || humidity === undefined || pressure === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    // Get the user ID from the session
    const userId = req.session.user.id;
    
    // Get notification settings for this user
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }
    
    // Get the chat ID from the first setting (all settings should have the same chat ID)
    const chatId = userSettings[0].chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Get preferred notification language (fallback to English)
    const lang = notificationLanguage || userSettings[0].notification_language || 'en';

    // Format the notification text based on language
    const messages = [];
    let chartTypes = [];
    
    if (temperature !== undefined && thresholds.temperature?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.temperature.thresholdType || 'range';
      
      if (thresholdType === 'range' && (temperature < thresholds.temperature.min || temperature > thresholds.temperature.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota je ${temperature}°C (mimo rozsah ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature is ${temperature}°C (outside range ${thresholds.temperature.min}°C - ${thresholds.temperature.max}°C) at ${location}`);
        }
        chartTypes.push('temperature');
      } else if (thresholdType === 'max' && temperature >= thresholds.temperature.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🌡️ Teplota dosiahla ${temperature}°C (prekročila cieľovú hodnotu ${thresholds.temperature.max}°C) na ${location}`);
        } else {
          messages.push(`🌡️ Temperature reached ${temperature}°C (exceeded target value ${thresholds.temperature.max}°C) at ${location}`);
        }
        chartTypes.push('temperature');
      }
    }
    
    if (humidity !== undefined && thresholds.humidity?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.humidity.thresholdType || 'range';
      
      if (thresholdType === 'range' && (humidity < thresholds.humidity.min || humidity > thresholds.humidity.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť je ${humidity}% (mimo rozsah ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity is ${humidity}% (outside range ${thresholds.humidity.min}% - ${thresholds.humidity.max}%) at ${location}`);
        }
        chartTypes.push('humidity');
      } else if (thresholdType === 'max' && humidity >= thresholds.humidity.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`💧 Vlhkosť dosiahla ${humidity}% (prekročila cieľovú hodnotu ${thresholds.humidity.max}%) na ${location}`);
        } else {
          messages.push(`💧 Humidity reached ${humidity}% (exceeded target value ${thresholds.humidity.max}%) at ${location}`);
        }
        chartTypes.push('humidity');
      }
    }
    
    if (pressure !== undefined && thresholds.pressure?.enabled) {
      // Get the threshold type (range or max)
      const thresholdType = thresholds.pressure.thresholdType || 'range';
      
      if (thresholdType === 'range' && (pressure < thresholds.pressure.min || pressure > thresholds.pressure.max)) {
        // Range threshold type - notify when outside range
        if (lang === 'sk') {
          messages.push(`🧭 Tlak je ${pressure} hPa (mimo rozsah ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure is ${pressure} hPa (outside range ${thresholds.pressure.min} hPa - ${thresholds.pressure.max} hPa) at ${location}`);
        }
        chartTypes.push('pressure');
      } else if (thresholdType === 'max' && pressure >= thresholds.pressure.max) {
        // Max threshold type - notify when threshold is reached
        if (lang === 'sk') {
          messages.push(`🧭 Tlak dosiahol ${pressure} hPa (prekročil cieľovú hodnotu ${thresholds.pressure.max} hPa) na ${location}`);
        } else {
          messages.push(`🧭 Pressure reached ${pressure} hPa (exceeded target value ${thresholds.pressure.max} hPa) at ${location}`);
        }
        chartTypes.push('pressure');
      }
    }
    
    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: lang === 'sk' ? 'Neboli zistené žiadne porušenia limitov ani dosiahnuté cieľové hodnoty' : 'No threshold violations or target values detected'
      });
    }
    
    const text = messages.join('\n');
    
    // Send the notification text
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(500).json({
        success: false,
        message: lang === 'sk' 
          ? `Nepodarilo sa odoslať upozornenie: ${data.description}` 
          : `Failed to send notification: ${data.description}`
      });
    }
    
    // Send charts for each affected sensor type
    const chartResults = [];
    const options = {
      timeRangeMinutes: 60, // Show last hour
      language: lang
    };
    
    try {
      // Send charts sequentially to avoid race conditions
      for (const chartType of chartTypes) {
        const chartResult = await telegramChart.sendSensorChart(
          chatId, 
          location, 
          chartType, 
          options
        );
        chartResults.push(chartResult);
      }
    } catch (chartError) {
      logger.error('Error sending charts:', chartError);
      // We'll still return success since the text notification was sent
    }
    
    return res.status(200).json({ 
      success: true, 
      message: lang === 'sk' ? 'Upozornenie úspešne odoslané' : 'Notification sent successfully',
      telegram: data,
      charts: chartResults
    });
  } catch (error) {
    logger.error('Error sending Telegram notification with charts:', error);
    const errorLang = req.body?.notificationLanguage || 'en';
    res.status(500).json({
      success: false,
      message: errorLang === 'sk' 
        ? `Chyba servera pri odosielaní upozornenia: ${error.message}` 
        : `Server error while sending notification: ${error.message}`
    });
  }
});

// Send offline notification
router.post('/notify-offline', ensureAuthenticated, async (req, res) => {
  try {
    const { location, status, lastSeenTime, notificationLanguage = 'en' } = req.body;

    if (!location || status === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters (location and status)'
      });
    }

    // Get the user ID from the session or from X-User-ID header (for internal service calls)
    const userId = req.headers['x-user-id'] || (req.session && req.session.user && req.session.user.id);
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in session or headers'
      });
    }
    
    // Get notification settings for this user
    const userSettings = await notificationSettings.getUserSettings(userId);
    
    if (userSettings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    // Check if there's a setting for this location
    const locationSettings = userSettings.find(setting => setting.location === location);
    if (!locationSettings) {
      return res.status(400).json({
        success: false,
        message: `No notification settings found for location: ${location}`
      });
    }

    // Check if offline notifications are enabled for this location
    if (locationSettings.offline_notification_enabled !== 1) {
      return res.status(400).json({
        success: false,
        message: `Offline notifications are not enabled for location: ${location}`
      });
    }
    
    // Get the chat ID from the settings
    const chatId = locationSettings.chat_id;
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram chat ID not configured'
      });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot token not configured'
      });
    }

    // Get preferred notification language (fallback to English)
    const lang = notificationLanguage || locationSettings.notification_language || 'en';

    // Status tracking to prevent duplicate notifications
    // Using SQLite to store last notification status for each location
    const db = getDB();
    
    // Create table if it doesn't exist
    db.prepare(`CREATE TABLE IF NOT EXISTS offline_notifications (
      location TEXT PRIMARY KEY,
      last_status TEXT,
      last_notification_time INTEGER
    )`).run();
    
    // Check if we've already sent a notification for this status
    const lastNotification = db.prepare('SELECT * FROM offline_notifications WHERE location = ?').get(location);
    const now = Date.now();
    
    // Don't send duplicate notifications for the same status
    // Only send if:
    // 1. We have no record of previous notification OR
    // 2. Status has changed since last notification OR
    // 3. It's been more than 24 hours since last notification for this status
    const shouldSendNotification = !lastNotification || 
                                 lastNotification.last_status !== status ||
                                 (now - lastNotification.last_notification_time > 24 * 60 * 60 * 1000);
    
    if (!shouldSendNotification) {
      return res.status(200).json({
        success: true,
        message: 'Notification skipped - already sent for this status',
        notification_sent: false
      });
    }

    // Format the last seen time for display
    const formattedLastSeen = lastSeenTime ? new Date(lastSeenTime).toLocaleString() : null;

    // Format message based on status (online/offline) and language
    let text;
    if (status === 'online') {
      if (lang === 'sk') {
        text = `✅ Senzor v lokalite "${location}" je opäť ONLINE!`;
      } else {
        text = `✅ Sensor in location "${location}" is back ONLINE!`;
      }
    } else {
      if (lang === 'sk') {
        text = `⚠️ Senzor v lokalite "${location}" je OFFLINE! ${formattedLastSeen ? `Posledný záznam: ${formattedLastSeen}` : 'Skontrolujte pripojenie.'}`;
      } else {
        text = `⚠️ Sensor in location "${location}" is OFFLINE! ${formattedLastSeen ? `Last data recorded: ${formattedLastSeen}` : 'Please check connection.'}`;
      }
    }
    
    // Send the notification
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        chat_id: chatId,
        text: text,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return res.status(500).json({
        success: false,
        message: lang === 'sk' 
          ? `Nepodarilo sa odoslať upozornenie o offline stave: ${data.description}` 
          : `Failed to send offline notification: ${data.description}`
      });
    }
    
    // Update the notification status in the database
    const stmt = db.prepare(`
      INSERT INTO offline_notifications (location, last_status, last_notification_time)
      VALUES (?, ?, ?)
      ON CONFLICT(location) DO UPDATE SET
      last_status = excluded.last_status,
      last_notification_time = excluded.last_notification_time
    `);
    
    stmt.run(location, status, now);
    
    return res.status(200).json({ 
      success: true, 
      message: lang === 'sk' ? 'Upozornenie o offline stave úspešne odoslané' : 'Offline notification sent successfully',
      notification_sent: true,
      telegram: data 
    });
  } catch (error) {
    logger.error('Error sending Telegram offline notification:', error);
    const errorLang = req.body?.notificationLanguage || 'en';
    res.status(500).json({
      success: false,
      message: errorLang === 'sk' 
        ? `Chyba servera pri odosielaní upozornenia o offline stave: ${error.message}` 
        : `Server error while sending offline notification: ${error.message}`
    });
  }
});

module.exports = router; 