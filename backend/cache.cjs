// cache.cjs - Redis caching module
const dotenv = require('dotenv');
dotenv.config();

// Default cache TTL (time to live) in seconds
const DEFAULT_CACHE_TTL = 60 * 5; // 5 minutes

// Use in-memory caching if Redis is not available
let isRedisAvailable = false;
const memoryCache = new Map();

// Check if Redis is being used
const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Only import Redis if caching is enabled
let redis;
let redisClient;

async function setupCache() {
  if (!CACHE_ENABLED) {
    console.log('Caching is disabled');
    return;
  }

  try {
    // Import Redis dynamically to avoid dependency issues when Redis isn't used
    redis = await import('redis');
    console.log('Setting up Redis cache connection...');
    
    redisClient = redis.createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
      }
    });

    // Connect to Redis
    await redisClient.connect();
    
    // Handle Redis events
    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
      isRedisAvailable = false;
    });
    
    redisClient.on('connect', () => {
      console.log('Connected to Redis successfully');
      isRedisAvailable = true;
    });
    
    redisClient.on('reconnecting', () => {
      console.log('Reconnecting to Redis...');
    });
    
    isRedisAvailable = true;
    console.log('Redis cache initialized');
    
  } catch (error) {
    console.error('Error initializing Redis cache:', error.message);
    console.log('Falling back to in-memory cache');
    isRedisAvailable = false;
  }
}

// Call setup function
setupCache();

// Cache get function - tries Redis first, falls back to in-memory
async function get(key) {
  if (!CACHE_ENABLED) return null;
  
  try {
    if (isRedisAvailable && redisClient) {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } else {
      return memoryCache.get(key) || null;
    }
  } catch (error) {
    console.error(`Error getting cache for key ${key}:`, error.message);
    return null;
  }
}

// Cache set function with TTL
async function set(key, value, ttl = DEFAULT_CACHE_TTL) {
  if (!CACHE_ENABLED) return;
  
  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } else {
      memoryCache.set(key, value);
      
      // Set expiry for memory cache
      setTimeout(() => {
        memoryCache.delete(key);
      }, ttl * 1000);
    }
  } catch (error) {
    console.error(`Error setting cache for key ${key}:`, error.message);
  }
}

// Delete cache entry
async function del(key) {
  if (!CACHE_ENABLED) return;
  
  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.del(key);
    } else {
      memoryCache.delete(key);
    }
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error.message);
  }
}

// Clear all cache (use with caution)
async function flushAll() {
  if (!CACHE_ENABLED) return;
  
  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.flushAll();
    } else {
      memoryCache.clear();
    }
    console.log('Cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error.message);
  }
}

// Close Redis connection when application is shutting down
async function close() {
  if (isRedisAvailable && redisClient) {
    await redisClient.quit();
    console.log('Redis connection closed');
  }
}

module.exports = {
  get,
  set,
  del,
  flushAll,
  close
}; 