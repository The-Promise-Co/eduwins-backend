const redis = require('redis');

let client;

/**
 * Initialize Redis client
 */
async function initRedis() {
  try {
    client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });

    client.on('error', (err) => {
      console.log('⚠️ Redis error (non-critical):', err.message);
    });

    client.on('connect', () => {
      console.log('✅ Redis connected');
    });

    await client.connect();
  } catch (err) {
    console.log('⚠️ Redis connection failed (non-critical):', err.message);
    console.log('ℹ️ App will continue without Redis caching');
  }
}

/**
 * Get Redis client
 */
function getClient() {
  if (!client) {
    console.log('⚠️ Redis client not initialized');
  }
  return {
    setex: async (key, ttl, value) => {
      try {
        if (client) {
          await client.setEx(key, ttl, value);
        }
      } catch (err) {
        console.log('Redis setex error:', err.message);
      }
    },
    get: async (key) => {
      try {
        if (client) {
          return await client.get(key);
        }
        return null;
      } catch (err) {
        console.log('Redis get error:', err.message);
        return null;
      }
    },
    del: async (key) => {
      try {
        if (client) {
          await client.del(key);
        }
      } catch (err) {
        console.log('Redis del error:', err.message);
      }
    },
  };
}

module.exports = { initRedis, getClient };
