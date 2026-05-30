'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

let redis;

function connectRedis() {
  return new Promise((resolve, reject) => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('✅ Redis connected');
      resolve(redis);
    });

    redis.on('error', (err) => {
      logger.error('❌ Redis error:', err.message);
      // Don't crash — Redis failure is non-fatal; fall through to DB
    });

    redis.on('reconnecting', () => {
      logger.warn('🔄 Redis reconnecting...');
    });

    redis.connect().catch(reject);
  });
}

// ─── Cache Key Builders ────────────────────────────────────────────────────────
// Documented pattern: task_list:<orgId>:<assigneeId>:<status>:<priority>:<page>:<limit>
const CacheKeys = {
  // Task list for a specific assignee — primary cache pattern
  taskList: (orgId, params = {}) => {
    const { assigneeId = 'all', status = 'all', priority = 'all', page = 1, limit = 20 } = params;
    return `task_list:${orgId}:${assigneeId}:${status}:${priority}:${page}:${limit}`;
  },

  // Wildcard pattern for invalidation: deletes ALL task list caches for an org
  taskListPattern: (orgId) => `task_list:${orgId}:*`,

  // Task list caches for a specific assignee (invalidate on task update for that user)
  taskListByAssignee: (orgId, assigneeId) => `task_list:${orgId}:${assigneeId}:*`,

  // Single task detail
  task: (taskId) => `task:${taskId}`,
};

const TTL = parseInt(process.env.REDIS_TTL_SECONDS) || 300; // 5 minutes default

// ─── Cache Helpers ─────────────────────────────────────────────────────────────
const cache = {
  async get(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.warn(`Cache GET failed for key ${key}:`, err.message);
      return null; // Cache miss on error — degrade gracefully
    }
  },

  async set(key, value, ttl = TTL) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (err) {
      logger.warn(`Cache SET failed for key ${key}:`, err.message);
    }
  },

  async del(key) {
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn(`Cache DEL failed for key ${key}:`, err.message);
    }
  },

  /**
   * Delete all keys matching a pattern using SCAN (not KEYS — avoids blocking Redis).
   * Used for invalidating all task list caches for an org or assignee.
   */
  async delPattern(pattern) {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          logger.debug(`Cache invalidated ${keys.length} keys matching ${pattern}`);
        }
      } while (cursor !== '0');
    } catch (err) {
      logger.warn(`Cache DELPATTERN failed for pattern ${pattern}:`, err.message);
    }
  },
};

module.exports = { connectRedis, get redis() { return redis; }, cache, CacheKeys, TTL };
