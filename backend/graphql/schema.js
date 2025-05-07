/**
 * GraphQL Schema for the IoT Dashboard
 * This file defines the GraphQL types and resolvers for the application
 */
const { gql } = require('apollo-server-express');
const { fetchSensorLocations, getLastSeenFromInflux, getActualStartTimeFromInflux } = require('../utils/influxHelpers');
const cache = require('../cache.cjs');
const config = require('../config/config');

// GraphQL Schema
const typeDefs = gql`
  # Sensor data type
  type Sensor {
    name: String!
    cardVisible: Boolean
    locationVisible: Boolean
    defaultCard: Boolean
    status: SensorStatus
    color: String
  }

  # Sensor status information
  type SensorStatus {
    name: String!
    lastSeen: String
    online: Boolean
    uptimeDuration: String
    offlineDuration: String
    startTime: String
  }

  # Reading type (temperature, humidity, pressure)
  type Reading {
    time: String!
    value: Float
    field: String!
    location: String!
  }

  # Pagination info
  type PaginationInfo {
    page: Int!
    limit: Int!
    totalCount: Int
    totalPages: Int
  }

  # Paginated readings result
  type PaginatedReadings {
    data: [Reading!]!
    pagination: PaginationInfo
  }

  # Query type
  type Query {
    # Get all sensors
    sensors: [Sensor!]!
    
    # Get a specific sensor by name
    sensor(name: String!): Sensor
    
    # Get sensor status information
    sensorStatus(name: String!): SensorStatus
    
    # Get all sensor statuses
    sensorStatuses: [SensorStatus!]!
    
    # Get historical readings for a sensor
    sensorReadings(
      name: String!, 
      range: String = "24h",
      fields: [String!] = ["teplota", "vlhkost", "tlak"],
      aggregation: Boolean = false,
      downsample: String = null,
      start: String = null,
      stop: String = null,
      page: Int = 1,
      limit: Int = 0
    ): PaginatedReadings
    
    # Get cache statistics
    cacheStats: CacheStats
  }

  # Cache statistics
  type CacheStats {
    enabled: Boolean!
    type: String
    keyCount: Int
    memoryUsed: String
  }

  # Mutation type
  type Mutation {
    # Update sensor visibility
    updateSensorVisibility(
      name: String!,
      cardVisible: Boolean,
      locationVisible: Boolean,
      defaultCard: Boolean
    ): Sensor
    
    # Clear cache
    clearCache(pattern: String): Boolean
  }
`;

// Resolvers
const resolvers = {
  Query: {
    // Get all sensors
    sensors: async () => {
      try {
        // Try to get from cache first
        const cachedSensors = await cache.get('sensors_all');
        if (cachedSensors) return cachedSensors;

        // Get sensors from database/API
        const locations = await fetchSensorLocations();
        const sensors = locations.map(name => {
          // This is a simplified example - you would get these from your database
          return {
            name,
            cardVisible: true,
            locationVisible: true,
            defaultCard: false
          };
        });

        // Cache result
        await cache.set('sensors_all', sensors, 300); // 5 minutes
        return sensors;
      } catch (error) {
        console.error('GraphQL Error - sensors:', error);
        throw new Error('Failed to fetch sensors');
      }
    },

    // Get a specific sensor
    sensor: async (_, { name }) => {
      try {
        // Try to get from cache
        const cacheKey = `sensor_${name}`;
        const cachedSensor = await cache.get(cacheKey);
        if (cachedSensor) return cachedSensor;

        // Check if sensor exists
        const locations = await fetchSensorLocations();
        if (!locations.includes(name)) return null;

        // Create sensor object
        const sensor = {
          name,
          cardVisible: true,
          locationVisible: true,
          defaultCard: false
        };

        // Cache result
        await cache.set(cacheKey, sensor, 300); // 5 minutes
        return sensor;
      } catch (error) {
        console.error(`GraphQL Error - sensor(${name}):`, error);
        throw new Error(`Failed to fetch sensor ${name}`);
      }
    },

    // Get sensor status
    sensorStatus: async (_, { name }) => {
      try {
        // Try to get from cache
        const cacheKey = `sensor_status_${name}`;
        const cachedStatus = await cache.get(cacheKey);
        if (cachedStatus) {
          console.log(`[DEBUG GraphQL] sensorStatus(${name}): using cached status`, cachedStatus);
          return cachedStatus;
        }

        // Get last seen timestamp
        const lastSeen = await getLastSeenFromInflux(name);
        console.log(`[DEBUG GraphQL] sensorStatus(${name}): lastSeen = ${lastSeen}`);
        
        if (!lastSeen) {
          console.log(`[DEBUG GraphQL] sensorStatus(${name}): No data found, marking as offline`);
          return { name, online: false, uptime: 0 };
        }

        // Calculate if sensor is online
        const now = Date.now();
        const lastSeenTime = lastSeen.getTime(); // lastSeen is already a Date object now
        const timeSinceLastSeen = now - lastSeenTime;
        
        // If we've seen the sensor within the last 10 minutes, it's online
        const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
        const online = timeSinceLastSeen < OFFLINE_THRESHOLD;
        
        console.log(`[DEBUG GraphQL] sensorStatus(${name}): timeSinceLastSeen = ${timeSinceLastSeen}ms, online = ${online}`);

        // Get start time for uptime calculation
        const startTime = await getActualStartTimeFromInflux(name);
        console.log(`[DEBUG GraphQL] sensorStatus(${name}): startTime = ${startTime}`);
        
        // Calculate uptime
        let uptime = 0;
        if (startTime && online) {
          const startTimeObj = new Date(startTime);
          uptime = Math.floor((now - startTimeObj.getTime()) / 1000); // uptime in seconds
          console.log(`[DEBUG GraphQL] sensorStatus(${name}): calculated uptime = ${uptime}s`);
        }

        // Get the latest sensor values (temperature, humidity, etc.)
        const latestValues = await getLatestSensorValues(name);
        
        // Create the result object
        const result = {
          name,
          online,
          uptime,
          lastSeen: lastSeen.toISOString(),
          ...(startTime ? { startTime } : {}),
          ...latestValues
        };
        
        console.log(`[DEBUG GraphQL] sensorStatus(${name}): result =`, result);
        
        // Cache the result for a short time
        await cache.set(cacheKey, result, 60); // Cache for 60 seconds
        
        return result;
      } catch (error) {
        console.error(`Error getting sensor status for ${name}:`, error);
        return { name, online: false, error: error.message };
      }
    },

    // Get all sensor statuses
    sensorStatuses: async () => {
      try {
        // Try to get from cache
        const cacheKey = 'sensor_statuses_all';
        const cachedStatuses = await cache.get(cacheKey);
        if (cachedStatuses) return cachedStatuses;

        // Get all sensors
        const locations = await fetchSensorLocations();
        
        // Get status for each sensor
        const now = Date.now();
        const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes threshold

        const statuses = await Promise.all(
          locations.map(async (name) => {
            // Get the last seen timestamp
            const lastSeen = await getLastSeenFromInflux(name);
            
            // Calculate if the sensor is online based on the 10-minute threshold
            const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
            const timeSinceLastSeen = lastSeen ? now - lastSeenTime : null;
            const isOnline = lastSeen && timeSinceLastSeen < OFFLINE_THRESHOLD;
            
            // Calculate uptime or offline duration based on current status
            let uptimeDuration = null;
            let offlineDuration = null;
            let startTime = null;
            
            if (isOnline) {
              // Get the start time when the sensor was last restarted
              startTime = await getActualStartTimeFromInflux(name);
              if (startTime) {
                const startTimeMs = new Date(startTime).getTime();
                const uptimeMs = now - startTimeMs;
                uptimeDuration = formatDuration(uptimeMs);
              }
            } else if (lastSeen) {
              // For offline duration, calculate time since last seen
              offlineDuration = formatDuration(timeSinceLastSeen);
            }

            return {
              name,
              lastSeen,
              online: isOnline,
              uptimeDuration,
              offlineDuration,
              startTime
            };
          })
        );

        // Cache result for a short time (1 minute)
        await cache.set(cacheKey, statuses, 60);
        return statuses;
      } catch (error) {
        console.error('GraphQL Error - sensorStatuses:', error);
        throw new Error('Failed to fetch sensor statuses');
      }
    },

    // Get historical readings for a sensor
    sensorReadings: async (_, { 
      name, range, fields, aggregation, downsample, start, stop, page, limit 
    }) => {
      try {
        // Same implementation as the REST API but returns in GraphQL format
        const customTimeRange = start && stop;
        
        // Cache key for this query
        const timeRangeKey = customTimeRange ? `${start.substring(0, 10)}_${stop.substring(0, 10)}` : range;
        const fieldsStr = Array.isArray(fields) ? fields.join('_') : fields;
        const paginationKey = limit > 0 ? `_p${page}_l${limit}` : '';
        const cacheKey = `gql_history_${name}_${timeRangeKey}_${fieldsStr}_${aggregation ? downsample || 'agg' : 'raw'}${paginationKey}`;
        
        // Try to get from cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) return cachedData;

        // Build InfluxDB query
        // This would contain similar logic to your REST API
        // For brevity, I'm using a placeholder implementation
        
        // In a real implementation, you'd query InfluxDB and transform the data
        // For now, we'll return a placeholder
        const result = {
          data: [],
          pagination: {
            page,
            limit: limit || 1000,
            totalCount: 0,
            totalPages: 1
          }
        };
        
        // Cache result
        await cache.set(cacheKey, result, 300); // 5 minutes
        return result;
      } catch (error) {
        console.error(`GraphQL Error - sensorReadings(${name}):`, error);
        throw new Error(`Failed to fetch readings for sensor ${name}`);
      }
    },

    // Get cache statistics
    cacheStats: async () => {
      try {
        return await cache.getStats();
      } catch (error) {
        console.error('GraphQL Error - cacheStats:', error);
        throw new Error('Failed to fetch cache statistics');
      }
    }
  },

  Mutation: {
    // Update sensor visibility
    updateSensorVisibility: async (_, { name, cardVisible, locationVisible, defaultCard }) => {
      try {
        // In a real implementation, you'd update the database
        // For now, just return the updated sensor
        const sensor = {
          name,
          cardVisible: cardVisible !== undefined ? cardVisible : true,
          locationVisible: locationVisible !== undefined ? locationVisible : true,
          defaultCard: defaultCard !== undefined ? defaultCard : false
        };
        
        // Invalidate relevant caches
        await cache.del(`sensor_${name}`);
        await cache.del('sensors_all');
        
        return sensor;
      } catch (error) {
        console.error(`GraphQL Error - updateSensorVisibility(${name}):`, error);
        throw new Error(`Failed to update visibility for sensor ${name}`);
      }
    },

    // Clear cache
    clearCache: async (_, { pattern }) => {
      try {
        if (pattern) {
          await cache.delByPattern(pattern);
        } else {
          await cache.flushAll();
        }
        return true;
      } catch (error) {
        console.error(`GraphQL Error - clearCache(${pattern}):`, error);
        throw new Error('Failed to clear cache');
      }
    }
  },

  // Resolvers for nested fields
  Sensor: {
    // Get status for a sensor
    status: async (parent) => {
      try {
        // If status is already loaded, return it
        if (parent.status) return parent.status;
        
        // Otherwise, fetch it
        const { name } = parent;
        const cacheKey = `sensor_status_${name}`;
        const cachedStatus = await cache.get(cacheKey);
        if (cachedStatus) return cachedStatus;

        // Get last seen timestamp
        const lastSeen = await getLastSeenFromInflux(name);
        if (!lastSeen) return { name, online: false };

        // Calculate if sensor is online
        const now = Date.now();
        const lastSeenTime = new Date(lastSeen).getTime();
        const timeSinceLastSeen = now - lastSeenTime;
        const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes threshold
        const isOnline = timeSinceLastSeen < OFFLINE_THRESHOLD;

        // Calculate uptime or offline duration based on current status
        let uptimeDuration = null;
        let offlineDuration = null;
        let startTime = null;

        if (isOnline) {
          // Get the start time when sensor was last restarted
          startTime = await getActualStartTimeFromInflux(name);
          if (startTime) {
            const startTimeMs = new Date(startTime).getTime();
            const uptimeMs = now - startTimeMs;
            uptimeDuration = formatDuration(uptimeMs);
          }
        } else if (lastSeen) {
          // For offline duration, calculate time since last seen
          offlineDuration = formatDuration(timeSinceLastSeen);
        }

        const status = {
          name,
          lastSeen,
          online: isOnline,
          uptimeDuration,
          offlineDuration,
          startTime
        };

        // Cache result for a short time (1 minute)
        await cache.set(cacheKey, status, 60);
        return status;
      } catch (error) {
        console.error(`GraphQL Error - Sensor.status(${parent.name}):`, error);
        return null;
      }
    }
  }
};

// Helper function for formatting durations (from existing code)
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `<1m`;
  }
}

module.exports = { typeDefs, resolvers }; 