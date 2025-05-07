// cache.cjs - Enhanced Redis caching module
const dotenv = require('dotenv');
dotenv.config();

// Default cache TTL (time to live) in seconds
const DEFAULT_CACHE_TTL = 60 * 5; // 5 minutes

// Use in-memory caching if Redis is not available
let isRedisAvailable = false;
const memoryCache = new Map();
const memoryCacheMeta = new Map(); // Store metadata about cached items

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

// Cache set function with TTL and metadata
async function set(key, value, ttl = DEFAULT_CACHE_TTL) {
  if (!CACHE_ENABLED) return;
  
  try {
    // Store metadata about this cache entry
    const metadata = {
      key,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      ttl
    };
    
    if (isRedisAvailable && redisClient) {
      // For Redis, we store the value with expiration
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
      
      // Also store metadata in a separate key
      await redisClient.set(`meta:${key}`, JSON.stringify(metadata), { EX: ttl });
    } else {
      memoryCache.set(key, value);
      memoryCacheMeta.set(key, metadata);
      
      // Set expiry for memory cache
      setTimeout(() => {
        memoryCache.delete(key);
        memoryCacheMeta.delete(key);
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
      await redisClient.del(`meta:${key}`);
    } else {
      memoryCache.delete(key);
      memoryCacheMeta.delete(key);
    }
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error.message);
  }
}

// Delete cache entries by pattern (e.g., "history_*")
async function delByPattern(pattern) {
  if (!CACHE_ENABLED) return;
  
  try {
    if (isRedisAvailable && redisClient) {
      // For Redis, we can use the SCAN command to find keys matching a pattern
      let cursor = 0;
      do {
        const { cursor: nextCursor, keys } = await redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });
        
        cursor = nextCursor;
        
        if (keys.length > 0) {
          console.log(`Deleting ${keys.length} keys matching pattern: ${pattern}`);
          // Delete keys in batches to avoid blocking Redis
          await redisClient.del(keys);
          
          // Also delete metadata
          const metaKeys = keys.map(key => `meta:${key}`);
          await redisClient.del(metaKeys);
        }
      } while (cursor !== 0);
    } else {
      // For memory cache, we iterate through all keys and check the pattern
      for (const key of memoryCache.keys()) {
        if (key.includes(pattern) || new RegExp(pattern.replace('*', '.*')).test(key)) {
          memoryCache.delete(key);
          memoryCacheMeta.delete(key);
        }
      }
    }
  } catch (error) {
    console.error(`Error deleting cache by pattern ${pattern}:`, error.message);
  }
}

// Get metadata about a cached item
async function getMeta(key) {
  if (!CACHE_ENABLED) return null;
  
  try {
    if (isRedisAvailable && redisClient) {
      const meta = await redisClient.get(`meta:${key}`);
      return meta ? JSON.parse(meta) : null;
    } else {
      return memoryCacheMeta.get(key) || null;
    }
  } catch (error) {
    console.error(`Error getting cache metadata for key ${key}:`, error.message);
    return null;
  }
}

// Get all cache keys matching a pattern
async function getKeys(pattern = '*') {
  if (!CACHE_ENABLED) return [];
  
  try {
    if (isRedisAvailable && redisClient) {
      // For Redis, we use SCAN to avoid blocking with KEYS command
      const keys = [];
      let cursor = 0;
      
      do {
        const result = await redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });
        
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);
      
      return keys;
    } else {
      // For memory cache, filter keys by pattern
      return Array.from(memoryCache.keys()).filter(key => 
        key.includes(pattern) || new RegExp(pattern.replace('*', '.*')).test(key)
      );
    }
  } catch (error) {
    console.error(`Error getting cache keys with pattern ${pattern}:`, error.message);
    return [];
  }
}

// Get cache stats
async function getStats() {
  if (!CACHE_ENABLED) return { enabled: false };
  
  try {
    if (isRedisAvailable && redisClient) {
      // For Redis, get info about the server
      const info = await redisClient.info();
      const memory = await redisClient.info('memory');
      const dbSize = await redisClient.dbSize();
      
      return {
        enabled: true,
        type: 'redis',
        keyCount: dbSize,
        memoryUsed: memory.split('\r\n')
          .find(line => line.startsWith('used_memory_human:'))
          ?.split(':')[1]?.trim() || 'unknown',
        serverInfo: {
          version: info.split('\r\n').find(line => line.startsWith('redis_version:'))?.split(':')[1]?.trim(),
          uptime: info.split('\r\n').find(line => line.startsWith('uptime_in_seconds:'))?.split(':')[1]?.trim()
        }
      };
    } else {
      // For memory cache, just return the size
      return {
        enabled: true,
        type: 'memory',
        keyCount: memoryCache.size,
        memoryUsed: 'N/A'
      };
    }
  } catch (error) {
    console.error('Error getting cache stats:', error.message);
    return {
      enabled: CACHE_ENABLED,
      error: error.message
    };
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
      memoryCacheMeta.clear();
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
  delByPattern,
  getMeta,
  getKeys,
  getStats,
  flushAll,
  close
}; 