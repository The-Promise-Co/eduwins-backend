import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

/**
 * Initialize Redis client
 */
export async function initRedis(): Promise<void> {
  try {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    client = createClient({
      socket: {
        host,
        port,
      }
    }) as RedisClientType;

    client.on('error', (err: Error) => {
      console.log('⚠️ Redis error (non-critical):', err.message);
    });

    client.on('connect', () => {
      console.log('✅ Redis connected');
    });

    await client.connect();
  } catch (err: any) {
    console.log('⚠️ Redis connection failed (non-critical):', err.message);
    console.log('ℹ️ App will continue without Redis caching');
    client = null;
  }
}

/**
 * Get Redis client wrapper
 */
export function getClient() {
  if (!client) {
    console.log('⚠️ Redis client not initialized');
  }
  return {
    setex: async (key: string, ttl: number, value: string): Promise<void> => {
      try {
        if (client) {
          await client.setEx(key, ttl, value);
        }
      } catch (err: any) {
        console.log('Redis setex error:', err.message);
      }
    },
    get: async (key: string): Promise<string | null> => {
      try {
        if (client) {
          return await client.get(key);
        }
        return null;
      } catch (err: any) {
        console.log('Redis get error:', err.message);
        return null;
      }
    },
    del: async (key: string): Promise<void> => {
      try {
        if (client) {
          await client.del(key);
        }
      } catch (err: any) {
        console.log('Redis del error:', err.message);
      }
    },
  };
}
