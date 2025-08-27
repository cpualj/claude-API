import Redis from 'ioredis';

let redis;
let subscriber;
let publisher;

export async function setupRedis() {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    // 主 Redis 连接
    redis = new Redis(redisConfig);
    
    // 发布订阅连接
    subscriber = new Redis(redisConfig);
    publisher = new Redis(redisConfig);

    // 连接事件处理
    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });

    redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    // 测试连接
    await redis.ping();
    console.log('✅ Redis ping successful');

    return {
      redis,
      subscriber,
      publisher,
      // 便捷方法
      get: redis.get.bind(redis),
      set: redis.set.bind(redis),
      del: redis.del.bind(redis),
      exists: redis.exists.bind(redis),
      expire: redis.expire.bind(redis),
      hget: redis.hget.bind(redis),
      hset: redis.hset.bind(redis),
      hdel: redis.hdel.bind(redis),
      hgetall: redis.hgetall.bind(redis),
      sadd: redis.sadd.bind(redis),
      srem: redis.srem.bind(redis),
      smembers: redis.smembers.bind(redis),
      zadd: redis.zadd.bind(redis),
      zrem: redis.zrem.bind(redis),
      zrange: redis.zrange.bind(redis),
      zcard: redis.zcard.bind(redis),
    };
  } catch (error) {
    console.error('❌ Redis setup failed:', error);
    throw error;
  }
}

// Session 缓存管理
export class SessionCache {
  constructor(redisClient, ttl = 3600) {
    this.redis = redisClient;
    this.ttl = ttl;
    this.keyPrefix = 'session:';
  }

  async set(sessionId, data) {
    const key = this.keyPrefix + sessionId;
    const value = JSON.stringify({
      ...data,
      lastActivity: Date.now()
    });
    
    await this.redis.setex(key, this.ttl, value);
    return true;
  }

  async get(sessionId) {
    const key = this.keyPrefix + sessionId;
    const value = await this.redis.get(key);
    
    if (!value) return null;
    
    try {
      const data = JSON.parse(value);
      // 更新最后活动时间
      data.lastActivity = Date.now();
      await this.set(sessionId, data);
      return data;
    } catch (error) {
      console.error('Session parse error:', error);
      await this.redis.del(key);
      return null;
    }
  }

  async delete(sessionId) {
    const key = this.keyPrefix + sessionId;
    return await this.redis.del(key);
  }

  async exists(sessionId) {
    const key = this.keyPrefix + sessionId;
    return await this.redis.exists(key);
  }

  async extend(sessionId, newTtl = null) {
    const key = this.keyPrefix + sessionId;
    const ttl = newTtl || this.ttl;
    return await this.redis.expire(key, ttl);
  }

  async getAllSessions(pattern = '*') {
    const keys = await this.redis.keys(this.keyPrefix + pattern);
    const sessions = [];
    
    for (const key of keys) {
      const value = await this.redis.get(key);
      if (value) {
        try {
          const sessionId = key.replace(this.keyPrefix, '');
          const data = JSON.parse(value);
          sessions.push({ sessionId, ...data });
        } catch (error) {
          console.error('Session parse error:', error);
        }
      }
    }
    
    return sessions;
  }
}

// Worker 状态管理
export class WorkerStatusManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.keyPrefix = 'worker:';
    this.statusKey = 'workers:status';
  }

  async registerWorker(workerId, info) {
    const key = this.keyPrefix + workerId;
    const data = {
      ...info,
      status: 'online',
      registeredAt: Date.now(),
      lastSeen: Date.now()
    };

    await this.redis.hset(this.statusKey, workerId, JSON.stringify(data));
    await this.redis.setex(key + ':heartbeat', 60, Date.now());
    
    return data;
  }

  async updateWorkerStatus(workerId, status, metadata = {}) {
    const current = await this.getWorker(workerId);
    if (!current) return null;

    const updated = {
      ...current,
      status,
      ...metadata,
      lastSeen: Date.now()
    };

    await this.redis.hset(this.statusKey, workerId, JSON.stringify(updated));
    return updated;
  }

  async getWorker(workerId) {
    const data = await this.redis.hget(this.statusKey, workerId);
    return data ? JSON.parse(data) : null;
  }

  async getAllWorkers() {
    const workers = await this.redis.hgetall(this.statusKey);
    const result = {};
    
    for (const [id, data] of Object.entries(workers)) {
      try {
        result[id] = JSON.parse(data);
      } catch (error) {
        console.error('Worker data parse error:', error);
      }
    }
    
    return result;
  }

  async removeWorker(workerId) {
    await this.redis.hdel(this.statusKey, workerId);
    await this.redis.del(this.keyPrefix + workerId + ':heartbeat');
    return true;
  }

  async heartbeat(workerId) {
    const key = this.keyPrefix + workerId + ':heartbeat';
    await this.redis.setex(key, 60, Date.now());
    
    // 更新状态中的 lastSeen
    const current = await this.getWorker(workerId);
    if (current) {
      current.lastSeen = Date.now();
      await this.redis.hset(this.statusKey, workerId, JSON.stringify(current));
    }
    
    return true;
  }

  async getOfflineWorkers(timeoutMs = 90000) {
    const workers = await this.getAllWorkers();
    const now = Date.now();
    const offline = [];

    for (const [id, worker] of Object.entries(workers)) {
      if (now - worker.lastSeen > timeoutMs) {
        offline.push({ id, ...worker });
      }
    }

    return offline;
  }
}

// 请求队列管理
export class RequestQueue {
  constructor(redisClient, queueName = 'chat_requests') {
    this.redis = redisClient;
    this.queueName = queueName;
    this.processingSet = queueName + ':processing';
    this.resultPrefix = queueName + ':result:';
  }

  async enqueue(request) {
    const requestId = request.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const data = {
      ...request,
      id: requestId,
      enqueuedAt: Date.now(),
      status: 'queued'
    };

    await this.redis.lpush(this.queueName, JSON.stringify(data));
    return requestId;
  }

  async dequeue(timeout = 10) {
    const result = await this.redis.brpop(this.queueName, timeout);
    if (!result) return null;

    const data = JSON.parse(result[1]);
    data.status = 'processing';
    data.processedAt = Date.now();

    // 添加到处理中集合
    await this.redis.sadd(this.processingSet, data.id);
    
    return data;
  }

  async complete(requestId, result) {
    const resultKey = this.resultPrefix + requestId;
    const data = {
      requestId,
      result,
      completedAt: Date.now(),
      status: 'completed'
    };

    await this.redis.setex(resultKey, 3600, JSON.stringify(data)); // 结果保存1小时
    await this.redis.srem(this.processingSet, requestId);
    
    return data;
  }

  async fail(requestId, error) {
    const resultKey = this.resultPrefix + requestId;
    const data = {
      requestId,
      error: error.message || error,
      failedAt: Date.now(),
      status: 'failed'
    };

    await this.redis.setex(resultKey, 3600, JSON.stringify(data));
    await this.redis.srem(this.processingSet, requestId);
    
    return data;
  }

  async getResult(requestId) {
    const resultKey = this.resultPrefix + requestId;
    const data = await this.redis.get(resultKey);
    return data ? JSON.parse(data) : null;
  }

  async getQueueSize() {
    return await this.redis.llen(this.queueName);
  }

  async getProcessingCount() {
    return await this.redis.scard(this.processingSet);
  }

  async getStats() {
    return {
      queued: await this.getQueueSize(),
      processing: await this.getProcessingCount()
    };
  }
}

// Rate Limiting
export class RateLimiter {
  constructor(redisClient) {
    this.redis = redisClient;
    this.keyPrefix = 'rate_limit:';
  }

  async isAllowed(key, limit, windowSeconds = 3600) {
    const redisKey = this.keyPrefix + key;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    // 使用 Redis Sorted Set 实现滑动窗口
    const pipe = this.redis.pipeline();
    
    // 移除过期的记录
    pipe.zremrangebyscore(redisKey, 0, windowStart);
    
    // 添加当前请求
    pipe.zadd(redisKey, now, `${now}-${Math.random()}`);
    
    // 获取当前窗口内的请求数
    pipe.zcard(redisKey);
    
    // 设置过期时间
    pipe.expire(redisKey, windowSeconds * 2);
    
    const results = await pipe.exec();
    const currentCount = results[2][1];
    
    return {
      allowed: currentCount <= limit,
      count: currentCount,
      limit,
      resetTime: now + windowSeconds
    };
  }

  async getRemainingRequests(key, limit, windowSeconds = 3600) {
    const redisKey = this.keyPrefix + key;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    await this.redis.zremrangebyscore(redisKey, 0, windowStart);
    const count = await this.redis.zcard(redisKey);
    
    return Math.max(0, limit - count);
  }
}

export async function closeRedis() {
  const connections = [redis, subscriber, publisher].filter(Boolean);
  
  await Promise.all(
    connections.map(conn => conn.disconnect())
  );
  
  redis = null;
  subscriber = null;
  publisher = null;
  
  console.log('✅ Redis connections closed');
}

export {
  redis,
  subscriber,
  publisher
};