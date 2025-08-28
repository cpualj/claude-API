import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import browserPoolService from '../../services/browserPoolService.js';

describe('BrowserPoolService', () => {
  beforeEach(() => {
    // Reset service state before each test
    browserPoolService.pool.clear();
    browserPoolService.waitingQueue = [];
    browserPoolService.initialized = false;
    browserPoolService.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      poolUtilization: 0,
      recycledInstances: 0
    };
  });

  afterEach(() => {
    // Clean up after each test
    if (browserPoolService.healthCheckTimer) {
      clearInterval(browserPoolService.healthCheckTimer);
      browserPoolService.healthCheckTimer = null;
    }
  });

  describe('initialization', () => {
    it('should initialize with default options', async () => {
      await browserPoolService.initialize();
      
      expect(browserPoolService.initialized).toBe(true);
      expect(browserPoolService.pool.size).toBeGreaterThanOrEqual(2);
    });

    it('should initialize with custom options', async () => {
      const options = {
        minInstances: 3,
        maxInstances: 10,
        warmupOnStart: false
      };
      
      await browserPoolService.initialize(options);
      
      expect(browserPoolService.initialized).toBe(true);
      expect(browserPoolService.pool.size).toBe(3);
      expect(browserPoolService.options.maxInstances).toBe(10);
    });

    it('should not reinitialize if already initialized', async () => {
      await browserPoolService.initialize();
      const firstPoolSize = browserPoolService.pool.size;
      
      await browserPoolService.initialize();
      
      expect(browserPoolService.pool.size).toBe(firstPoolSize);
    });

    it('should emit initialized event', async () => {
      const listener = vi.fn();
      browserPoolService.on('initialized', listener);
      
      await browserPoolService.initialize();
      
      expect(listener).toHaveBeenCalledWith({
        poolSize: expect.any(Number)
      });
    });
  });

  describe('instance management', () => {
    beforeEach(async () => {
      await browserPoolService.initialize({
        minInstances: 2,
        maxInstances: 5,
        warmupOnStart: false
      });
    });

    it('should create a browser instance', async () => {
      const initialSize = browserPoolService.pool.size;
      const instance = await browserPoolService.createInstance();
      
      expect(instance).toBeDefined();
      expect(instance.id).toMatch(/^browser-/);
      expect(instance.busy).toBe(false);
      expect(browserPoolService.pool.size).toBe(initialSize + 1);
    });

    it('should not exceed maximum pool size', async () => {
      // Fill pool to max
      while (browserPoolService.pool.size < browserPoolService.options.maxInstances) {
        await browserPoolService.createInstance();
      }
      
      await expect(browserPoolService.createInstance()).rejects.toThrow('Maximum pool size reached');
    });

    it('should acquire an available instance', async () => {
      const instance = await browserPoolService.acquireInstance();
      
      expect(instance).toBeDefined();
      expect(instance.busy).toBe(true);
      expect(browserPoolService.stats.totalRequests).toBe(1);
    });

    it('should release an instance', async () => {
      const instance = await browserPoolService.acquireInstance();
      const instanceId = instance.id;
      
      await browserPoolService.releaseInstance(instanceId);
      
      expect(instance.busy).toBe(false);
      expect(instance.messageCount).toBe(1);
    });

    it('should handle concurrent acquire requests', async () => {
      const promises = [];
      
      // Request more instances than available
      for (let i = 0; i < 5; i++) {
        promises.push(browserPoolService.acquireInstance());
      }
      
      const instances = await Promise.all(promises);
      
      expect(instances.every(i => i !== null)).toBe(true);
      expect(browserPoolService.pool.size).toBeLessThanOrEqual(5);
    });

    it('should queue requests when pool is full', async () => {
      // Acquire all instances
      const instances = [];
      for (let i = 0; i < browserPoolService.options.maxInstances; i++) {
        const instance = await browserPoolService.acquireInstance();
        if (instance) instances.push(instance);
      }
      
      // Request one more (should wait)
      const waitPromise = browserPoolService.acquireInstance({ timeout: 1000 });
      
      // Release one instance after a delay
      setTimeout(() => {
        browserPoolService.releaseInstance(instances[0].id);
      }, 100);
      
      const waitedInstance = await waitPromise;
      expect(waitedInstance).toBeDefined();
    });
  });

  describe('instance recycling', () => {
    beforeEach(async () => {
      await browserPoolService.initialize({
        minInstances: 2,
        maxInstances: 5,
        maxMessagesPerInstance: 10,
        warmupOnStart: false
      });
    });

    it('should recycle instance when message limit reached', async () => {
      const instance = await browserPoolService.acquireInstance();
      const instanceId = instance.id;
      
      // Simulate reaching message limit
      instance.messageCount = 11;
      
      await browserPoolService.releaseInstance(instanceId);
      
      expect(browserPoolService.pool.has(instanceId)).toBe(false);
      expect(browserPoolService.stats.recycledInstances).toBe(1);
    });

    it('should recycle stale instances', async () => {
      const instance = Array.from(browserPoolService.pool.values())[0];
      const instanceId = instance.id;
      
      // Make instance stale
      instance.lastUsed = Date.now() - 700000; // 11+ minutes ago
      
      await browserPoolService.performHealthCheck();
      
      expect(browserPoolService.pool.has(instanceId)).toBe(false);
    });

    it('should maintain minimum pool size after recycling', async () => {
      const instance = Array.from(browserPoolService.pool.values())[0];
      const instanceId = instance.id;
      
      await browserPoolService.recycleInstance(instanceId);
      
      expect(browserPoolService.pool.size).toBeGreaterThanOrEqual(browserPoolService.options.minInstances);
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await browserPoolService.initialize({
        minInstances: 2,
        warmupOnStart: false
      });
    });

    it('should send a message through browser pool', async () => {
      const message = 'Test message';
      const response = await browserPoolService.sendMessage(message);
      
      expect(response).toBeDefined();
      expect(response.id).toMatch(/^msg-/);
      expect(response.instanceId).toMatch(/^browser-/);
      expect(browserPoolService.stats.successfulRequests).toBe(1);
    });

    it('should update conversation history', async () => {
      const message = 'Test message';
      const response = await browserPoolService.sendMessage(message);
      
      const instance = browserPoolService.pool.get(response.instanceId);
      expect(instance.conversationHistory).toHaveLength(2);
      expect(instance.conversationHistory[0].role).toBe('user');
      expect(instance.conversationHistory[1].role).toBe('assistant');
    });

    it('should handle message errors gracefully', async () => {
      // Mock an error scenario
      const originalAcquire = browserPoolService.acquireInstance;
      browserPoolService.acquireInstance = vi.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(browserPoolService.sendMessage('Test')).rejects.toThrow('Test error');
      expect(browserPoolService.stats.failedRequests).toBe(1);
      
      browserPoolService.acquireInstance = originalAcquire;
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await browserPoolService.initialize({
        minInstances: 2,
        warmupOnStart: false
      });
    });

    it('should track pool utilization', async () => {
      const instance1 = await browserPoolService.acquireInstance();
      const instance2 = await browserPoolService.acquireInstance();
      
      browserPoolService.updatePoolStats();
      
      expect(browserPoolService.stats.poolUtilization).toBe(100);
      
      await browserPoolService.releaseInstance(instance1.id);
      browserPoolService.updatePoolStats();
      
      expect(browserPoolService.stats.poolUtilization).toBe(50);
    });

    it('should calculate average response time', async () => {
      browserPoolService.stats.successfulRequests = 0;
      
      browserPoolService.updateAverageResponseTime(1000);
      expect(browserPoolService.stats.averageResponseTime).toBe(1000);
      
      browserPoolService.updateAverageResponseTime(2000);
      expect(browserPoolService.stats.averageResponseTime).toBe(1500);
    });

    it('should provide detailed stats', () => {
      const stats = browserPoolService.getStats();
      
      expect(stats).toHaveProperty('poolSize');
      expect(stats).toHaveProperty('busyInstances');
      expect(stats).toHaveProperty('healthyInstances');
      expect(stats).toHaveProperty('instances');
      expect(stats.instances).toBeInstanceOf(Array);
    });
  });

  describe('health checks', () => {
    beforeEach(async () => {
      await browserPoolService.initialize({
        minInstances: 2,
        healthCheckInterval: 100,
        warmupOnStart: false
      });
    });

    it('should perform health checks', async () => {
      const listener = vi.fn();
      browserPoolService.on('healthCheckCompleted', listener);
      
      await browserPoolService.performHealthCheck();
      
      expect(listener).toHaveBeenCalled();
    });

    it('should mark unhealthy instances', async () => {
      const instance = Array.from(browserPoolService.pool.values())[0];
      instance.health = 'unhealthy';
      
      await browserPoolService.performHealthCheck();
      
      // Unhealthy instances should be recycled if not busy
      if (!instance.busy) {
        expect(browserPoolService.pool.has(instance.id)).toBe(false);
      }
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await browserPoolService.initialize({
        minInstances: 2,
        warmupOnStart: false
      });
    });

    it('should shutdown gracefully', async () => {
      const listener = vi.fn();
      browserPoolService.on('shutdown', listener);
      
      await browserPoolService.shutdown();
      
      expect(browserPoolService.initialized).toBe(false);
      expect(browserPoolService.pool.size).toBe(0);
      expect(browserPoolService.healthCheckTimer).toBeNull();
      expect(listener).toHaveBeenCalled();
    });

    it('should clear waiting queue on shutdown', async () => {
      // Add some waiting callbacks
      browserPoolService.waitingQueue = [() => {}, () => {}];
      
      await browserPoolService.shutdown();
      
      expect(browserPoolService.waitingQueue).toHaveLength(0);
    });
  });
});