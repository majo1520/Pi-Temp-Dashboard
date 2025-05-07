/**
 * MQTT Routes for Sensor Data
 * 
 * This module handles incoming sensor data via MQTT and HTTP endpoints,
 * using a message queue for reliable processing of high volume data.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const mqtt = require('mqtt');
const { addSensorDataJob } = require('../queues/sensorDataQueue');
const config = require('../config/config');

// MQTT client configuration
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
let mqttClient = null;

// Initialize MQTT client and subscribe to topics
function initializeMqtt() {
  try {
    logger.log(`Connecting to MQTT broker at ${MQTT_BROKER}...`);
    
    mqttClient = mqtt.connect(MQTT_BROKER, {
      clientId: `dashboard_backend_${process.pid}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000
    });
    
    mqttClient.on('connect', () => {
      logger.log('Connected to MQTT broker');
      
      // Subscribe to sensor data topics
      mqttClient.subscribe('sensors/#', (err) => {
        if (err) {
          logger.error('Error subscribing to sensor topics:', err);
        } else {
          logger.log('Subscribed to sensors/# topic');
        }
      });
    });
    
    mqttClient.on('message', async (topic, message) => {
      try {
        logger.log(`Received message on topic ${topic}`);
        
        // Parse message
        const parsedMessage = parseMessage(topic, message.toString());
        
        // Add to processing queue
        await addSensorDataJob(parsedMessage);
      } catch (error) {
        logger.error(`Error processing MQTT message on topic ${topic}:`, error);
      }
    });
    
    mqttClient.on('error', (error) => {
      logger.error('MQTT client error:', error);
    });
    
    mqttClient.on('offline', () => {
      logger.log('MQTT client offline');
    });
    
    mqttClient.on('reconnect', () => {
      logger.log('MQTT client reconnecting...');
    });
    
  } catch (error) {
    logger.error('Error initializing MQTT client:', error);
  }
}

// Parse MQTT message based on topic
function parseMessage(topic, message) {
  try {
    // Determine message format (JSON or plain text)
    let parsedData;
    try {
      parsedData = JSON.parse(message);
    } catch (e) {
      // If not JSON, try to parse as plain text
      parsedData = { value: parseFloat(message) };
    }
    
    // Extract location and field from topic
    // Example topic: sensors/livingroom/temperature
    const parts = topic.split('/');
    const location = parts[1] || 'unknown';
    const field = parts[2] || 'unknown';
    
    // Create standardized job data
    return {
      location,
      timestamp: new Date().toISOString(),
      topic,
      measurements: {
        [field]: parsedData.value || parsedData
      },
      rawData: parsedData
    };
  } catch (error) {
    logger.error(`Error parsing MQTT message from topic ${topic}:`, error);
    return null;
  }
}

// HTTP endpoint for receiving sensor data
router.post('/data', async (req, res) => {
  try {
    const { location, measurements } = req.body;
    
    if (!location || !measurements) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Missing required fields: location and measurements'
      });
    }
    
    // Add job to queue for processing
    await addSensorDataJob({
      location,
      timestamp: new Date().toISOString(),
      measurements,
      source: 'http'
    });
    
    res.status(202).json({ message: 'Data accepted for processing' });
  } catch (error) {
    logger.error('Error handling sensor data submission:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: 'Failed to process sensor data'
    });
  }
});

// Initialize MQTT client if enabled
if (config.MQTT_ENABLED === 'true') {
  initializeMqtt();
}

// Graceful shutdown
process.on('SIGINT', () => {
  if (mqttClient) {
    logger.log('Closing MQTT client...');
    mqttClient.end();
  }
});

module.exports = router; 