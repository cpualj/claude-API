import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createMockRedisServices } from '../mocks/redis.js';

// Mock the entire Redis module
vi.mock('../../services/redis.js', async () => {
  const { createMockRedisServices } = await import('../mocks/redis.js');
  const mockServices = createMockRedisServices();
  
  return {
    setupRedis: vi.fn().mockResolvedValue(mockServices),
    closeRedis: vi.fn().mockResolvedValue(true),
    SessionCache: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getUserSessions: vi.fn()
    })),
    WorkerStatusManager: vi.fn().mockImplementation(() => ({
      registerWorker: vi.fn(),
      getWorker: vi.fn(),
      updateHeartbeat: vi.fn(),
      getActiveWorkers: vi.fn(),
      removeWorker: vi.fn()
    })),
    RequestQueue: vi.fn().mockImplementation(() => ({
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      setResult: vi.fn(),
      getResult: vi.fn(),
      getStats: vi.fn()
    })),
    RateLimiter: vi.fn().mockImplementation(() => ({
      checkLimit: vi.fn(),
      getRemainingRequests: vi.fn(),
      checkBurstLimit: vi.fn()
    }))
  };
});

describe('Redis Services', () => {
  let redisServices;
  let sessionCache;
  let workerStatusManager;
  let requestQueue;
  let rateLimiter;

  beforeAll(async () => {
    redisServices = createMockRedisServices();
    sessionCache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getUserSessions: vi.fn()
    };
    workerStatusManager = {
      registerWorker: vi.fn(),
      getWorker: vi.fn(),
      updateHeartbeat: vi.fn(),
      getActiveWorkers: vi.fn(),
      removeWorker: vi.fn()
    };
    requestQueue = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      setResult: vi.fn(),
      getResult: vi.fn(),
      getStats: vi.fn()
    };
    rateLimiter = {
      checkLimit: vi.fn(),
      getRemainingRequests: vi.fn(),
      checkBurstLimit: vi.fn()
    };
  });

  afterAll(async () => {
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await redisServices.flushdb();
  });

  describe('Redis Connection', () => {
    it('should establish Redis connection', async () => {
      const result = await redisServices.redis.ping();
      expect(result).toBe('PONG');
    });

    it('should handle basic get/set operations', async () => {
      const key = 'test-key';
      const value = 'test-value';
      
      await redisServices.set(key, value);
      const retrieved = await redisServices.get(key);
      
      expect(retrieved).toBe(value);
    });

    it('should handle JSON data', async () => {
      const key = 'test-json';
      const data = { id: 1, name: 'test', active: true };
      
      await redisServices.set(key, JSON.stringify(data));
      const retrieved = JSON.parse(await redisServices.get(key));
      
      expect(retrieved).toEqual(data);
    });

    it('should handle TTL expiration', async () => {
      const key = 'ttl-test';
      const value = 'expires-soon';
      
      await redisServices.setWithTTL(key, value, 1); // 1 second
      
      let retrieved = await redisServices.get(key);
      expect(retrieved).toBe(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      retrieved = await redisServices.get(key);
      expect(retrieved).toBeNull();
    });
  });

  describe('SessionCache', () => {
    it('should store and retrieve session data', async () => {
      const sessionId = 'session-123';
      const sessionData = {
        userId: 'user-456',
        apiKeyId: 'key-789',
        toolId: 'claude',
        context: [{ role: 'user', content: 'Hello' }],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000)
      };

      await sessionCache.set(sessionId, sessionData, 3600);
      const retrieved = await sessionCache.get(sessionId);
      
      expect(retrieved).toEqual(expect.objectContaining({
        userId: sessionData.userId,
        apiKeyId: sessionData.apiKeyId,
        toolId: sessionData.toolId,
        context: sessionData.context
      }));
    });

    it('should handle session expiration', async () => {
      const sessionId = 'expiring-session';
      const sessionData = { userId: 'user-123' };
      
      await sessionCache.set(sessionId, sessionData, 1); // 1 second TTL
      
      let retrieved = await sessionCache.get(sessionId);
      expect(retrieved).toBeTruthy();
      
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      retrieved = await sessionCache.get(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should delete sessions', async () => {
      const sessionId = 'delete-test';
      const sessionData = { userId: 'user-123' };
      
      await sessionCache.set(sessionId, sessionData);
      const deleted = await sessionCache.delete(sessionId);
      
      expect(deleted).toBe(true);
      
      const retrieved = await sessionCache.get(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should list user sessions', async () => {
      const userId = 'user-123';
      const sessions = [
        { id: 'session-1', userId, toolId: 'claude' },
        { id: 'session-2', userId, toolId: 'openai' },
        { id: 'session-3', userId: 'other-user', toolId: 'claude' }
      ];

      for (const session of sessions) {
        await sessionCache.set(session.id, session);
      }

      const userSessions = await sessionCache.getUserSessions(userId);
      expect(userSessions).toHaveLength(2);
      expect(userSessions.every(s => s.userId === userId)).toBe(true);
    });
  });

  describe('WorkerStatusManager', () => {
    it('should register and track workers', async () => {
      const workerId = 'worker-1';
      const workerInfo = {
        id: workerId,
        type: 'local',
        status: 'online',
        lastHeartbeat: new Date(),
        currentLoad: 0,
        maxLoad: 5
      };

      await workerStatusManager.registerWorker(workerId, workerInfo);
      const retrieved = await workerStatusManager.getWorker(workerId);
      
      expect(retrieved).toEqual(expect.objectContaining({
        id: workerId,
        type: 'local',
        status: 'online'
      }));
    });

    it('should update worker heartbeat', async () => {
      const workerId = 'worker-heartbeat';
      const initialInfo = {
        id: workerId,
        status: 'online',
        lastHeartbeat: new Date(Date.now() - 10000), // 10 seconds ago
        currentLoad: 2
      };

      await workerStatusManager.registerWorker(workerId, initialInfo);
      await workerStatusManager.updateHeartbeat(workerId, { currentLoad: 3 });
      
      const updated = await workerStatusManager.getWorker(workerId);
      expect(updated.currentLoad).toBe(3);
      expect(new Date(updated.lastHeartbeat).getTime()).toBeGreaterThan(
        initialInfo.lastHeartbeat.getTime()
      );
    });

    it('should get all active workers', async () => {
      const workers = [
        { id: 'worker-1', status: 'online', currentLoad: 1 },
        { id: 'worker-2', status: 'online', currentLoad: 2 },
        { id: 'worker-3', status: 'offline', currentLoad: 0 }
      ];

      for (const worker of workers) {
        await workerStatusManager.registerWorker(worker.id, worker);
      }

      const activeWorkers = await workerStatusManager.getActiveWorkers();
      expect(activeWorkers).toHaveLength(2);
      expect(activeWorkers.every(w => w.status === 'online')).toBe(true);
    });

    it('should remove workers', async () => {
      const workerId = 'worker-remove';
      await workerStatusManager.registerWorker(workerId, { id: workerId, status: 'online' });
      
      const removed = await workerStatusManager.removeWorker(workerId);
      expect(removed).toBe(true);
      
      const retrieved = await workerStatusManager.getWorker(workerId);
      expect(retrieved).toBeNull();
    });
  });

  describe('RequestQueue', () => {
    it('should enqueue and dequeue requests', async () => {
      const request = {
        id: 'req-123',
        userId: 'user-456',
        message: 'Hello, Claude!',
        priority: 'normal',
        createdAt: new Date()
      };

      const requestId = await requestQueue.enqueue(request);
      expect(requestId).toBeTruthy();
      
      const dequeued = await requestQueue.dequeue();
      expect(dequeued).toEqual(expect.objectContaining({
        userId: request.userId,
        message: request.message
      }));
    });

    it('should handle priority queuing', async () => {
      const requests = [
        { id: 'req-1', message: 'Normal priority', priority: 'normal' },
        { id: 'req-2', message: 'High priority', priority: 'high' },
        { id: 'req-3', message: 'Low priority', priority: 'low' }
      ];

      for (const request of requests) {
        await requestQueue.enqueue(request);
      }

      const first = await requestQueue.dequeue();
      expect(first.message).toBe('High priority');
      
      const second = await requestQueue.dequeue();
      expect(second.message).toBe('Normal priority');
      
      const third = await requestQueue.dequeue();
      expect(third.message).toBe('Low priority');
    });

    it('should store and retrieve request results', async () => {
      const requestId = 'req-result-test';
      const result = {
        status: 'completed',
        response: 'Hello! How can I help you?',
        usage: { inputTokens: 10, outputTokens: 20 },
        completedAt: new Date()
      };

      await requestQueue.setResult(requestId, result);
      const retrieved = await requestQueue.getResult(requestId);
      
      expect(retrieved).toEqual(expect.objectContaining({
        status: 'completed',
        response: 'Hello! How can I help you?'
      }));
    });

    it('should get queue statistics', async () => {
      const requests = [
        { id: 'req-1', message: 'Request 1' },
        { id: 'req-2', message: 'Request 2' },
        { id: 'req-3', message: 'Request 3' }
      ];

      for (const request of requests) {
        await requestQueue.enqueue(request);
      }

      const stats = await requestQueue.getStats();
      expect(stats.queued).toBe(3);
      expect(stats.processing).toBe(0);
    });
  });

  describe('RateLimiter', () => {
    it('should enforce rate limits', async () => {
      const key = 'api_key:test-key';
      const limit = 5;
      const windowMs = 60000; // 1 minute

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        const allowed = await rateLimiter.checkLimit(key, limit, windowMs);
        expect(allowed).toBe(true);
      }

      // Next request should be rejected
      const rejected = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(rejected).toBe(false);
    });

    it('should reset limits after window expiration', async () => {
      const key = 'api_key:reset-test';
      const limit = 2;
      const windowMs = 1000; // 1 second

      // Exhaust the limit
      await rateLimiter.checkLimit(key, limit, windowMs);
      await rateLimiter.checkLimit(key, limit, windowMs);
      
      const rejected = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(rejected).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again
      const allowed = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(allowed).toBe(true);
    });

    it('should get remaining requests', async () => {
      const key = 'api_key:remaining-test';
      const limit = 10;
      const windowMs = 60000;

      // Make some requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(key, limit, windowMs);
      }

      const remaining = await rateLimiter.getRemainingRequests(key, limit);
      expect(remaining).toBe(7);
    });

    it('should handle burst limits', async () => {
      const key = 'api_key:burst-test';
      const hourlylimit = 100;
      const burstLimit = 5;
      const burstWindowMs = 60000; // 1 minute

      // Test burst limit
      for (let i = 0; i < burstLimit; i++) {
        const allowed = await rateLimiter.checkBurstLimit(key, burstLimit, burstWindowMs);
        expect(allowed).toBe(true);
      }

      const rejected = await rateLimiter.checkBurstLimit(key, burstLimit, burstWindowMs);
      expect(rejected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Close connection temporarily
      await redisServices.redis.disconnect();
      
      await expect(redisServices.get('test-key')).rejects.toThrow();
      
      // Reconnect for other tests
      redisServices = await setupRedis();
    });

    it('should handle invalid JSON data', async () => {
      const key = 'invalid-json';
      await redisServices.redis.set(key, 'invalid-json-data');
      
      await expect(sessionCache.get(key)).rejects.toThrow();
    });
  });
});