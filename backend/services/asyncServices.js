// asyncServices.js - Async components like queues
const { createQueue } = require('../queue.cjs');
const logger = require('../utils/logger');
const { notificationSettings } = require('../db.cjs');
const telegramChart = require('../telegram-chart.cjs');

// Track the last time a notification was sent for each location
const lastNotificationTimestamps = {};

// Track the last notification status for each location (online/offline)
const lastNotificationStatuses = {};

// Initialize async components
let exportQueue = null;

async function initializeAsyncComponents() {
  try {
    // Create an export queue for processing data exports asynchronously
    exportQueue = await createQueue('export-queue', {
      removeOnComplete: true,
      removeOnFail: 100
    });
    
    if (exportQueue) {
      // Register processor function
      exportQueue.registerProcessor && exportQueue.registerProcessor(async (jobData) => {
        logger.log(`Processing export job: ${jobData.type}`);
        // Perform the export operation here
        const { type, locations, range, filename } = jobData;
        
        // Mock export process (this would be your actual export logic)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true, filename };
      });
    }
    
    // Start periodic monitoring for sensor thresholds
    if (process.env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true') {
      logger.log('Telegram notifications are enabled, initializing monitoring service');
      // Initial delay before starting the first check
      setTimeout(() => {
        // Check thresholds on a regular interval
        setInterval(checkSensorThresholds, 60 * 1000); // Check every minute
      }, 10000); // Wait 10 seconds after startup before first check
    } else {
      logger.log('Telegram notifications are disabled (set TELEGRAM_NOTIFICATIONS_ENABLED=true to enable)');
    }
  } catch (error) {
    logger.error('Error initializing async components:', error);
  }
}

// Helper function to safely check if offline notifications are enabled
// Handles various data formats (boolean true, 1, string "1", etc.)
function isOfflineNotificationEnabled(setting) {
  // Handle explicit null/undefined
  if (setting === null || setting === undefined) {
    logger.log('isOfflineNotificationEnabled: setting is null or undefined');
    return false;
  }
  
  // Handle direct access to offline_notification_enabled
  if (setting.offline_notification_enabled !== undefined) {
    // Convert various formats to boolean
    if (typeof setting.offline_notification_enabled === 'boolean') {
      logger.log(`isOfflineNotificationEnabled: boolean value ${setting.offline_notification_enabled}`);
      return setting.offline_notification_enabled;
    } else if (typeof setting.offline_notification_enabled === 'number') {
      logger.log(`isOfflineNotificationEnabled: numeric value ${setting.offline_notification_enabled}`);
      return setting.offline_notification_enabled === 1;
    } else if (typeof setting.offline_notification_enabled === 'string') {
      // Handle string "true" or "1"
      logger.log(`isOfflineNotificationEnabled: string value "${setting.offline_notification_enabled}"`);
      return setting.offline_notification_enabled === "true" || 
             setting.offline_notification_enabled === "1";
    } else {
      // For any other type, just use truthy check
      logger.log(`isOfflineNotificationEnabled: other type ${typeof setting.offline_notification_enabled}, value: ${setting.offline_notification_enabled}`);
      return !!setting.offline_notification_enabled;
    }
  }
  
  // Try accessing via alternate paths
  if (setting.offline && setting.offline.enabled !== undefined) {
    logger.log(`isOfflineNotificationEnabled: using setting.offline.enabled: ${setting.offline.enabled}`);
    return !!setting.offline.enabled;
  }
  
  // Also check alternate field name
  if (setting.offlineNotificationsEnabled !== undefined) {
    logger.log(`isOfflineNotificationEnabled: using setting.offlineNotificationsEnabled: ${setting.offlineNotificationsEnabled}`);
    return !!setting.offlineNotificationsEnabled;
  }
  
  // Default to false if not found or in unexpected format
  logger.log('isOfflineNotificationEnabled: no value found, returning false');
  return false;
}

// Function to check sensor thresholds and send notifications
async function checkSensorThresholds() {
  try {
    logger.log('Checking sensor thresholds for notifications...');
    
    // Check if Telegram notifications are enabled in environment
    if (process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== 'true') {
      logger.log('Telegram notifications are disabled in environment variables');
      return;
    }
    
    // Get the bot token
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      logger.error('Telegram bot token not configured');
      return;
    }
    
    try {
      // Get all notification settings from database
      const allSettings = await notificationSettings.getAllSettings();
      
      // Group settings by user to process more efficiently
      const userSettings = {};
      
      allSettings.forEach(setting => {
        if (!userSettings[setting.user_id]) {
          userSettings[setting.user_id] = {
            chat_id: setting.chat_id,
            enabled: !!setting.enabled,
            locations: {}
          };
        }
        
        // Check if offline notifications are enabled using the helper function
        const offlineEnabled = isOfflineNotificationEnabled(setting);
        logger.log(`Offline notifications for ${setting.location}: ${offlineEnabled} (raw value: ${setting.offline_notification_enabled})`);
        
        // Only add locations where the user has enabled at least one threshold or offline notifications
        if (
          setting.temperature_enabled || 
          setting.humidity_enabled || 
          setting.pressure_enabled ||
          offlineEnabled
        ) {
          userSettings[setting.user_id].locations[setting.location] = {
            temperature: {
              enabled: !!setting.temperature_enabled,
              min: setting.temperature_min,
              max: setting.temperature_max,
              threshold_type: setting.temperature_threshold_type || 'range'
            },
            humidity: {
              enabled: !!setting.humidity_enabled,
              min: setting.humidity_min,
              max: setting.humidity_max,
              threshold_type: setting.humidity_threshold_type || 'range'
            },
            pressure: {
              enabled: !!setting.pressure_enabled,
              min: setting.pressure_min,
              max: setting.pressure_max,
              threshold_type: setting.pressure_threshold_type || 'range'
            },
            offline: {
              // Set the enabled flag based on helper function result
              enabled: offlineEnabled
            },
            frequency: setting.notification_frequency_minutes || 30,
            language: setting.notification_language || 'en',
            send_charts: setting.send_charts !== undefined ? !!setting.send_charts : true
          };
        }
      });
      
      // For each user, check their monitored locations
      for (const [userId, userData] of Object.entries(userSettings)) {
        // Skip users with no chat ID or where notifications are disabled
        if (!userData.chat_id || !userData.enabled) {
          continue;
        }
        
        // For each location this user is monitoring
        for (const [location, thresholds] of Object.entries(userData.locations)) {
          // Check if enough time has passed since the last notification
          const now = Date.now();
          const locationKey = `${userId}-${location}`;
          const lastNotified = lastNotificationTimestamps[locationKey] || 0;
          const minutesSinceLastNotification = (now - lastNotified) / (60 * 1000);
          
          // Skip this location if we've sent a notification too recently
          if (minutesSinceLastNotification < thresholds.frequency) {
            logger.log(`Skipping ${location} for user ${userId}: next notification available in ${Math.ceil(thresholds.frequency - minutesSinceLastNotification)} minutes`);
            continue;
          }
          
          // Query the latest data for this location from InfluxDB
          // First, find the last seen time of the sensor
          const influxUrl = process.env.INFLUX_URL || 'http://localhost:8086';
          const influxToken = process.env.INFLUX_TOKEN || '';
          const org = process.env.ORG || '';
          const bucket = process.env.BUCKET || '';
          
          const lastSeenQuery = `from(bucket: "${bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}")
            |> filter(fn: (r) => r["_field"] == "teplota")
            |> last()`;
          
          let lastSeenTime = null;
          try {
            const lastSeenResponse = await fetch(`${influxUrl}/api/v2/query?org=${org}`, {
              method: 'POST',
              headers: {
                'Authorization': `Token ${influxToken}`,
                'Content-Type': 'application/vnd.flux',
                'Accept': 'application/csv'
              },
              body: lastSeenQuery,
            });
            
            if (lastSeenResponse.ok) {
              const lastSeenCsv = await lastSeenResponse.text();
              const lastSeenLines = lastSeenCsv.split("\n").filter(line => line && !line.startsWith("#"));
              
              if (lastSeenLines.length > 1) {
                const headers = lastSeenLines[0].split(",").map(h => h.trim());
                const timeIndex = headers.indexOf("_time");
                
                if (timeIndex !== -1) {
                  const dataRow = lastSeenLines[1].split(",");
                  lastSeenTime = dataRow[timeIndex];
                  logger.log(`Last seen time for ${location}: ${lastSeenTime}`);
                }
              }
            }
          } catch (error) {
            logger.error(`Error getting last seen time for ${location}:`, error);
          }
          
          // Now query recent data to check if sensor is active
          const recentQuery = `from(bucket: "${bucket}")
            |> range(start: -15m)
            |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}")
            |> filter(fn: (r) => r["_field"] == "teplota" or r["_field"] == "vlhkost" or r["_field"] == "tlak")
            |> last()`;
          
          try {
            const response = await fetch(`${influxUrl}/api/v2/query?org=${org}`, {
              method: 'POST',
              headers: {
                'Authorization': `Token ${influxToken}`,
                'Content-Type': 'application/vnd.flux',
                'Accept': 'application/csv'
              },
              body: recentQuery,
            });
            
            // Check if offline notifications are enabled for this location
            const offlineNotificationsEnabled = thresholds.offline && thresholds.offline.enabled;
            
            // Debug log the offline notification status
            logger.log(`Offline notifications for ${location}: ${offlineNotificationsEnabled ? 'ENABLED' : 'DISABLED'}`);
            
            if (!response.ok) {
              logger.error(`Failed to fetch data for location ${location}:`, await response.text());
              
              // Send offline notification if enabled
              if (offlineNotificationsEnabled) {
                const lang = thresholds.language || 'en';
                
                // Call the REST API route directly instead of using sendTelegramNotification
                // This allows us to use the proper notification state tracking
                try {
                  const restApiUrl = process.env.API_BASE_URL || 'http://localhost:3001';
                  const notification = {
                    location,
                    status: 'offline',
                    lastSeenTime,
                    notificationLanguage: lang
                  };
                  
                  // Create a fake request session for the API call
                  const apiResponse = await fetch(`${restApiUrl}/notifications/telegram/notify-offline`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-User-ID': userId // Pass user ID in header
                    },
                    body: JSON.stringify(notification)
                  });
                  
                  if (apiResponse.ok) {
                    const responseData = await apiResponse.json();
                    
                    // If notification was actually sent (not skipped due to state tracking)
                    if (responseData.notification_sent) {
                      lastNotificationTimestamps[locationKey] = now;
                      logger.log(`Offline notification sent for ${location} via API`);
                    } else {
                      logger.log(`Offline notification skipped for ${location} (already sent)`);
                    }
                  } else {
                    logger.error(`Failed to send offline notification via API: ${await apiResponse.text()}`);
                  }
                } catch (error) {
                  logger.error(`Error sending offline notification via API: ${error.message}`);
                }
              }
              continue;
            }
            
            const csvText = await response.text();
            const lines = csvText.split("\n").filter(line => line && !line.startsWith("#"));
            
            // Check if there's no data (sensor might be offline)
            if (lines.length <= 1) {
              logger.log(`No recent data for location ${location}`);
              
              // Send offline notification if enabled
              if (offlineNotificationsEnabled) {
                const lang = thresholds.language || 'en';
                
                // Call the REST API route directly
                try {
                  const restApiUrl = process.env.API_BASE_URL || 'http://localhost:3001';
                  const notification = {
                    location,
                    status: 'offline',
                    lastSeenTime,
                    notificationLanguage: lang
                  };
                  
                  // Create a fake request session for the API call
                  const apiResponse = await fetch(`${restApiUrl}/notifications/telegram/notify-offline`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-User-ID': userId // Pass user ID in header
                    },
                    body: JSON.stringify(notification)
                  });
                  
                  if (apiResponse.ok) {
                    const responseData = await apiResponse.json();
                    
                    // If notification was actually sent (not skipped due to state tracking)
                    if (responseData.notification_sent) {
                      lastNotificationTimestamps[locationKey] = now;
                      logger.log(`Offline notification sent for ${location} via API`);
                    } else {
                      logger.log(`Offline notification skipped for ${location} (already sent)`);
                    }
                  } else {
                    logger.error(`Failed to send offline notification via API: ${await apiResponse.text()}`);
                  }
                } catch (error) {
                  logger.error(`Error sending offline notification via API: ${error.message}`);
                }
              }
              continue;
            }
            
            // If we reached here, sensor is online - check if it was previously considered offline
            // We need to check if we last sent an offline notification, and if so, send an online notification
            const previousNotificationType = lastNotificationStatuses && lastNotificationStatuses[locationKey];
            if (previousNotificationType === 'offline' && offlineNotificationsEnabled) {
              // Send online notification
              const lang = thresholds.language || 'en';
              
              try {
                const restApiUrl = process.env.API_BASE_URL || 'http://localhost:3001';
                const notification = {
                  location,
                  status: 'online',
                  notificationLanguage: lang
                };
                
                // Create a fake request session for the API call
                const apiResponse = await fetch(`${restApiUrl}/notifications/telegram/notify-offline`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': userId // Pass user ID in header
                  },
                  body: JSON.stringify(notification)
                });
                
                if (apiResponse.ok) {
                  const responseData = await apiResponse.json();
                  
                  // If notification was actually sent (not skipped due to state tracking)
                  if (responseData.notification_sent) {
                    lastNotificationTimestamps[locationKey] = now;
                    logger.log(`Online notification sent for ${location} via API`);
                  } else {
                    logger.log(`Online notification skipped for ${location} (already sent)`);
                  }
                } else {
                  logger.error(`Failed to send online notification via API: ${await apiResponse.text()}`);
                }
              } catch (error) {
                logger.error(`Error sending online notification via API: ${error.message}`);
              }
            }
            
            // Parse the data for regular threshold monitoring
            const headers = lines[0].split(",").map(h => h.trim());
            const fieldIndex = headers.indexOf("_field");
            const valueIndex = headers.indexOf("_value");
            
            if (fieldIndex === -1 || valueIndex === -1) {
              logger.error(`Invalid CSV response for location ${location}`);
              continue;
            }
            
            // Extract temperature, humidity, and pressure values
            let temperature = null;
            let humidity = null;
            let pressure = null;
            
            for (let i = 1; i < lines.length; i++) {
              const row = lines[i].split(",");
              const field = row[fieldIndex];
              const value = parseFloat(row[valueIndex]);
              
              if (field === "teplota") temperature = value;
              else if (field === "vlhkost") humidity = value;
              else if (field === "tlak") pressure = value;
            }
            
            // Check if we have valid readings
            if (temperature === null && humidity === null && pressure === null) {
              logger.log(`No valid readings for location ${location}`);
              
              // Send offline notification if enabled
              if (offlineNotificationsEnabled) {
                const lang = thresholds.language || 'en';
                const offlineMessage = lang === 'sk' 
                  ? `⚠️ Senzor ${location} je offline (chýbajú platné hodnoty)`
                  : `⚠️ Sensor ${location} is offline (missing valid readings)`;
                
                await sendTelegramNotification(
                  userData.chat_id,
                  offlineMessage,
                  userId,
                  location,
                  now
                );
              }
              continue;
            }
            
            logger.log(`Readings for ${location}: temp=${temperature}°C, humidity=${humidity}%, pressure=${pressure} hPa`);
            
            // Check thresholds and send notifications if needed
            const messages = [];
            const chartTypes = [];
            
            // Get the notification language
            const lang = thresholds.language || 'en';
            
            if (temperature !== null && thresholds.temperature.enabled) {
              // Get the threshold type (range or max)
              const thresholdType = thresholds.temperature.threshold_type || 'range';
              
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
            
            if (humidity !== null && thresholds.humidity.enabled) {
              // Get the threshold type (range or max)
              const thresholdType = thresholds.humidity.threshold_type || 'range';
              
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
            
            if (pressure !== null && thresholds.pressure.enabled) {
              // Get the threshold type (range or max)
              const thresholdType = thresholds.pressure.threshold_type || 'range';
              
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
            
            if (messages.length > 0) {
              // Send notification
              try {
                const notificationText = messages.join('\n');
                await sendTelegramNotification(
                  userData.chat_id,
                  notificationText,
                  userId,
                  location,
                  now
                );
                
                // Send charts if enabled
                if (chartTypes.length > 0 && thresholds.send_charts) {
                  const options = {
                    timeRangeMinutes: 60, // Show last hour of data
                    language: thresholds.language || 'en'
                  };
                  
                  try {
                    for (const chartType of chartTypes) {
                      await telegramChart.sendSensorChart(
                        userData.chat_id,
                        location,
                        chartType,
                        options
                      );
                    }
                    logger.log(`Charts sent successfully for ${location}`);
                  } catch (error) {
                    logger.error(`Error sending charts for ${location}:`, error);
                  }
                } else if (chartTypes.length > 0) {
                  // Charts are disabled but thresholds were exceeded
                  logger.log(`Charts are disabled for ${location}, skipping chart generation`);
                }
              } catch (error) {
                logger.error(`Error sending notification for ${location}:`, error);
              }
            } else {
              logger.log(`No thresholds exceeded for ${location}`);
            }
          } catch (error) {
            logger.error(`Error processing data for location ${location}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error getting notification settings from database:', error);
    }
  } catch (error) {
    logger.error('Error checking sensor thresholds:', error);
  }
}

// Helper function to send Telegram notifications and update timestamps
async function sendTelegramNotification(chatId, text, userId, location, timestamp) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
    
    const telegramData = await telegramResponse.json();
    
    if (telegramData.ok) {
      logger.log(`Notification sent successfully to user ${userId} for location ${location}`);
      
      // Update the last notification timestamp for this location
      const locationKey = `${userId}-${location}`;
      lastNotificationTimestamps[locationKey] = timestamp;
      
      // If the message contains offline/online status, track it
      if (text.includes('OFFLINE') || text.includes('offline')) {
        lastNotificationStatuses[locationKey] = 'offline';
      } else if (text.includes('ONLINE') || text.includes('online')) {
        lastNotificationStatuses[locationKey] = 'online';
      }
      
      return true;
    } else {
      logger.error(`Failed to send notification to ${location}:`, telegramData.description);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending notification for ${location}:`, error);
    return false;
  }
}

module.exports = {
  initializeAsyncComponents,
  getExportQueue: () => exportQueue,
  checkSensorThresholds
}; 