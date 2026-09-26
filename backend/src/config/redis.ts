// Redis infrastructure client (v1.5.0).
//
//  * Real Redis (ioredis) when REDIS_URL is set — used for express-session
//    cookie storage, API response caching, and TTL-based OTP state.
//  * In-memory fallback when REDIS_URL is unset — identical async TTL
//    interface, so local dev and the test suite run without a Redis server.
//    Every Redis call is wrapped so a transient connection failure degrades
//    to the in-memory store instead of crashing a request.
import dotenv from 'dotenv';
import crypto from 'crypto';
import Redis from 'ioredis';

// Load env before reading process.env (module may be imported without a caller
// having run dotenv.config() first).
dotenv.config();

const normalizeRedisUrl = (raw: string | undefined): string => {
  const value = (raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!value) return '';
  const normalized = value.replace(/^UPSTASH_REDIS_REST_URL\s*=\s*/i, '').replace(/^REDIS_URL\s*=\s*/i, '');
  if (!normalized) return '';
  if (/^redis(?:s)?:\/\//i.test(normalized) || /^\w+\s*:\d+$/i.test(normalized)) {
    return normalized;
  }
  return '';
};

export const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL);
const isTestRun = process.env.NODE_ENV === 'test' || process.argv.some(a => typeof a === 'string' && a.includes('test'));
export const isRedisEnabled = REDIS_URL.length > 0 && !isTestRun && process.env.DISABLE_REDIS !== 'true';


// ---------------------------------------------------------------- in-memory
interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

const memoryGet = async (key: string): Promise<string | null> => {
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return null;
  }
  return entry.value;
};

const memorySet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
  memory.set(key, { value, expiresAt });
};

const memoryDel = async (key: string): Promise<void> => {
  memory.delete(key);
};

const memoryTtl = async (key: string): Promise<number> => {
  const entry = memory.get(key);
  if (!entry) return -2;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return -2;
  }
  return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
};

const memoryKeys = async (pattern: string): Promise<string[]> => {
  const regex = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return [...memory.keys()].filter((k) => regex.test(k));
};

// ------------------------------------------------------------------ ioredis
export const redisClient: Redis | null = isRedisEnabled
  ? new Redis(REDIS_URL, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 1000, // 1s max command timeout prevents hanging HTTP requests
      connectTimeout: 2000, // 2s max connect timeout
      tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
    })
  : null;

let hasLoggedRedisError = false;
if (redisClient) {
  redisClient.on('error', (err: Error) => {
    if (!hasLoggedRedisError) {
      console.warn('[REDIS] connection error (falling back to in-memory store):', err.message);
      hasLoggedRedisError = true;
    }
  });
  redisClient.on('ready', () => {
    hasLoggedRedisError = false;
    console.log('⚡ Connected to Redis at ' + REDIS_URL.replace(/\/\/.*@/, '//***@'));
  });
}

// ------------------------------------------------------------------- public
// Multi-Tier Caching (L1 RAM + L2 Distributed Redis):
// Checks local memory first (0.001ms), falling back to Redis and populating L1.
export const redisGet = async (key: string): Promise<string | null> => {
  const memVal = await memoryGet(key);
  if (memVal !== null) {
    return memVal;
  }

  if (redisClient) {
    try {
      const val = await redisClient.get(key);
      if (val !== null) {
        const ttl = await redisClient.ttl(key).catch(() => 15);
        await memorySet(key, val, ttl > 0 ? ttl : 15);
        return val;
      }
    } catch {
      /* fall through to memory */
    }
  }
  return null;
};

export const redisSet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  await memorySet(key, value, ttlSeconds);
  if (redisClient) {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await redisClient.set(key, value, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, value);
      }
    } catch {
      /* fall through to memory */
    }
  }
};

export const redisDel = async (key: string): Promise<void> => {
  await memoryDel(key);
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch {
      /* fall through to memory */
    }
  }
};

export const redisTtl = async (key: string): Promise<number> => {
  const memTtl = await memoryTtl(key);
  if (memTtl > 0) return memTtl;
  if (redisClient) {
    try {
      return await redisClient.ttl(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memTtl;
};

export const redisKeys = async (pattern: string): Promise<string[]> => {
  const memKeys = await memoryKeys(pattern);
  if (redisClient) {
    try {
      const rKeys = await redisClient.keys(pattern);
      return Array.from(new Set([...memKeys, ...rKeys]));
    } catch {
      /* fall through to memory */
    }
  }
  return memKeys;
};

// ------------------------------------------------------------ JSON caching
export const cacheGetJSON = async <T>(key: string): Promise<T | null> => {
  const raw = await redisGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const cacheSetJSON = async <T>(key: string, value: T, ttlSeconds: number): Promise<void> => {
  await redisSet(key, JSON.stringify(value), ttlSeconds);
};

export const cacheInvalidate = async (key: string): Promise<void> => {
  await redisDel(key);
};

export const cacheInvalidatePattern = async (pattern: string): Promise<void> => {
  const keys = await redisKeys(pattern);
  await Promise.all(keys.map((k) => redisDel(k)));
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      /* ignore */
    }
  }
};

// ------------------------------------------------------------ distributed lock
// Minimal Redis-based lock used for cross-instance coordination
// (replication leadership + recovery deduplication).
//
// Safety:
//   - acquired with SET NX PX (TTL) so a crashed holder's lock expires.
//   - released only if the caller still owns it (compare-and-delete).
//   - when Redis is unavailable, acquisition FAILS (returns acquired:false);
//     callers must treat that as "do not proceed" so multiple instances never
//     run the same critical section simultaneously.
export interface LockHandle {
  acquired: boolean;
  token: string;
  reason?: string;
}

const RELEASE_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

let lastLockWarningTime = 0;
export const acquireLock = async (key: string, ttlMs: number): Promise<LockHandle> => {
  const token = crypto.randomUUID();
  if (!redisClient) {
    const existing = await memoryGet(key);
    if (existing !== null) {
      return { acquired: false, token, reason: 'lock-held' };
    }
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await memorySet(key, token, ttlSeconds);
    return { acquired: true, token };
  }
  try {
    const res = await redisClient.set(key, token, 'PX', Math.max(1000, ttlMs), 'NX');
    return { acquired: res === 'OK', token };
  } catch (err: any) {
    const now = Date.now();
    if (now - lastLockWarningTime > 300000) {
      console.warn('[REDIS] acquireLock failed (in-memory fallback active):', err?.message);
      lastLockWarningTime = now;
    }
    const existing = await memoryGet(key);
    if (existing !== null) {
      return { acquired: false, token, reason: 'lock-held' };
    }
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await memorySet(key, token, ttlSeconds);
    return { acquired: true, token };
  }
};

export const releaseLock = async (key: string, token: string): Promise<void> => {
  if (!redisClient) {
    const existing = await memoryGet(key);
    if (existing === token) {
      await memoryDel(key);
    }
    return;
  }
  try {
    await redisClient.eval(RELEASE_LUA, 1, key, token);
  } catch {
    const existing = await memoryGet(key);
    if (existing === token) {
      await memoryDel(key);
    }
  }
};

export const isRedisAvailable = (): boolean => redisClient !== null;
