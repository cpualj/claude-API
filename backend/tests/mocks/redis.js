import { vi } from 'vitest';
import EventEmitter from 'events';

// Mock Redis client
class MockRedisClient extends EventEmitter {
  constructor() {
    super();
    this.data = new Map();
    this.expirations = new Map();
    this.connected = true;
  }

  async ping() {
    return 'PONG';
  }

  async get(key) {
    this.checkExpiration(key);
    return this.data.get(key) || null;
  }

  async set(key, value, ...args) {
    this.data.set(key, value);
    
    // Handle EX option
    const exIndex = args.indexOf('EX');
    if (exIndex !== -1 && args[exIndex + 1]) {
      const ttl = args[exIndex + 1];
      this.expirations.set(key, Date.now() + ttl * 1000);
    }
    
    return 'OK';
  }

  async setex(key, ttl, value) {
    this.data.set(key, value);
    this.expirations.set(key, Date.now() + ttl * 1000);
    return 'OK';
  }

  async del(key) {
    const existed = this.data.has(key);
    this.data.delete(key);
    this.expirations.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key) {
    this.checkExpiration(key);
    return this.data.has(key) ? 1 : 0;
  }

  async flushdb() {
    this.data.clear();
    this.expirations.clear();
    return 'OK';
  }

  async disconnect() {
    this.connected = false;
    this.emit('close');
  }

  async quit() {
    return this.disconnect();
  }

  checkExpiration(key) {
    const expiration = this.expirations.get(key);
    if (expiration && Date.now() > expiration) {
      this.data.delete(key);
      this.expirations.delete(key);
    }
  }

  // Queue operations
  async lpush(key, ...values) {
    const list = JSON.parse(this.data.get(key) || '[]');
    list.unshift(...values);
    this.data.set(key, JSON.stringify(list));
    return list.length;
  }

  async rpop(key) {
    const list = JSON.parse(this.data.get(key) || '[]');
    const value = list.pop();
    this.data.set(key, JSON.stringify(list));
    return value || null;
  }

  async llen(key) {
    const list = JSON.parse(this.data.get(key) || '[]');
    return list.length;
  }

  // Hash operations
  async hset(key, field, value) {
    const hash = JSON.parse(this.data.get(key) || '{}');
    hash[field] = value;
    this.data.set(key, JSON.stringify(hash));
    return 1;
  }

  async hget(key, field) {
    const hash = JSON.parse(this.data.get(key) || '{}');
    return hash[field] || null;
  }

  async hgetall(key) {
    return JSON.parse(this.data.get(key) || '{}');
  }

  async hdel(key, field) {
    const hash = JSON.parse(this.data.get(key) || '{}');
    const existed = field in hash;
    delete hash[field];
    this.data.set(key, JSON.stringify(hash));
    return existed ? 1 : 0;
  }

  // Info command
  async info(section) {
    if (section === 'memory') {
      return 'used_memory_human:1.2M';
    }
    if (section === 'keyspace') {
      return 'db0:keys=10,expires=2';
    }
    return 'redis_version:7.0.0';
  }
}

// Create mock Redis services
export const createMockRedisServices = () => {
  const redis = new MockRedisClient();
  const subscriber = new MockRedisClient();
  const publisher = new MockRedisClient();

  return {
    redis,
    subscriber,
    publisher,
    get: async (key) => redis.get(key),
    set: async (key, value) => redis.set(key, value),
    setWithTTL: async (key, value, ttl) => redis.setex(key, ttl, value),
    del: async (key) => redis.del(key),
    exists: async (key) => redis.exists(key),
    flushdb: async () => redis.flushdb()
  };
};

// Reset function
export const resetRedisMocks = () => {
  // This will be called to reset state between tests
};