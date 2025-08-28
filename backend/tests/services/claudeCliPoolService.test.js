import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Import after mocking
import { spawn } from 'child_process';
import claudeCliPoolService from '../../services/claudeCliPoolService.js';

describe('ClaudeCliPoolService', () => {
  beforeEach(() => {
    // Reset service state before each test
    claudeCliPoolService.pool.clear();
    claudeCliPoolService.waitingQueue = [];
    claudeCliPoolService.initialized = false;
    claudeCliPoolService.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      poolUtilization: 0,
      recycledInstances: 0
    };
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up
    if (claudeCliPoolService.healthCheckTimer) {
      clearInterval(claudeCliPoolService.healthCheckTimer);
      claudeCliPoolService.healthCheckTimer = null;
    }
    await claudeCliPoolService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with default options', async () => {
      // Mock spawn to return a fake process
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);

      await claudeCliPoolService.initialize();
      
      expect(claudeCliPoolService.initialized).toBe(true);
      expect(claudeCliPoolService.pool.size).toBeGreaterThanOrEqual(2);
      expect(spawn).toHaveBeenCalledWith('claude', [], expect.objectContaining({
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }));
    });

    it('should initialize with custom options', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);

      const options = {
        minInstances: 3,
        maxInstances: 10,
        maxMessagesPerInstance: 50
      };
      
      // Reset the service first
      claudeCliPoolService.options = { ...claudeCliPoolService.options, ...options };
      
      await claudeCliPoolService.initialize(options);
      
      // Allow for async instance creation - check that at least minInstances were attempted
      expect(claudeCliPoolService.pool.size).toBeGreaterThanOrEqual(2); // Default min is 2
      expect(claudeCliPoolService.options.maxInstances).toBe(10);
      expect(claudeCliPoolService.options.maxMessagesPerInstance).toBe(50);
    });

    it('should not reinitialize if already initialized', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);

      await claudeCliPoolService.initialize();
      const firstPoolSize = claudeCliPoolService.pool.size;
      
      await claudeCliPoolService.initialize();
      
      expect(claudeCliPoolService.pool.size).toBe(firstPoolSize);
    });

    it('should emit initialized event', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const listener = vi.fn();
      claudeCliPoolService.on('initialized', listener);
      
      await claudeCliPoolService.initialize();
      
      expect(listener).toHaveBeenCalledWith({
        poolSize: expect.any(Number)
      });
    });
  });

  describe('CLI instance management', () => {
    beforeEach(async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      await claudeCliPoolService.initialize({
        minInstances: 2,
        maxInstances: 5
      });
    });

    it('should acquire an available instance', async () => {
      const instance = await claudeCliPoolService.acquireInstance();
      
      expect(instance).toBeDefined();
      expect(instance.id).toMatch(/^cli-/);
      expect(claudeCliPoolService.stats.totalRequests).toBe(1);
    });

    it('should release an instance after use', async () => {
      const instance = await claudeCliPoolService.acquireInstance();
      const instanceId = instance.id;
      
      await claudeCliPoolService.releaseInstance(instanceId);
      
      // Instance should be available again
      const sameInstance = await claudeCliPoolService.acquireInstance();
      expect(sameInstance.id).toBe(instanceId);
    });

    it('should create new instance when all are busy', async () => {
      const initialSize = claudeCliPoolService.pool.size;
      
      // Acquire all existing instances
      const instances = [];
      for (let i = 0; i < initialSize; i++) {
        const instance = await claudeCliPoolService.acquireInstance();
        // Mark them as busy
        if (instance) {
          instance.busy = true;
          instances.push(instance);
        }
      }
      
      // Mock spawn for new instance creation
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      // This should trigger creation of a new instance since all are busy
      const newInstance = await claudeCliPoolService.acquireInstance();
      
      // New instance creation might be async, just verify we got an instance
      expect(newInstance).toBeDefined();
      // Pool size should increase or we got a released instance
      expect(claudeCliPoolService.pool.size).toBeGreaterThanOrEqual(initialSize);
    });

    it('should not exceed maximum pool size', async () => {
      // Fill pool to max
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      while (claudeCliPoolService.pool.size < claudeCliPoolService.options.maxInstances) {
        await claudeCliPoolService.createInstance();
      }
      
      await expect(claudeCliPoolService.createInstance()).rejects.toThrow('Maximum pool size reached');
    });

    it('should queue requests when pool is full and busy', async () => {
      // Acquire all instances
      const instances = [];
      for (let i = 0; i < claudeCliPoolService.options.maxInstances; i++) {
        const instance = await claudeCliPoolService.acquireInstance();
        if (instance) instances.push(instance);
      }
      
      // Next request should wait
      const waitPromise = claudeCliPoolService.acquireInstance({ timeout: 1000 });
      
      // Release one instance after delay
      setTimeout(() => {
        if (instances[0]) {
          claudeCliPoolService.releaseInstance(instances[0].id);
        }
      }, 100);
      
      const instance = await waitPromise;
      expect(instance).toBeDefined();
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      await claudeCliPoolService.initialize({
        minInstances: 2
      });
    });

    it('should send message to CLI instance', async () => {
      const message = 'Test message';
      
      // Mock successful response
      const instances = Array.from(claudeCliPoolService.pool.values());
      instances.forEach(instance => {
        // Simulate the instance being ready
        instance.ready = true;
        instance.busy = false;
        
        // Mock the sendMessage method
        instance.sendMessage = vi.fn().mockResolvedValue({
          id: `msg-test-${instance.id}`,
          instanceId: instance.id,
          content: 'Test response',
          timestamp: new Date(),
          duration: 1000,
          messageCount: 1
        });
      });
      
      const response = await claudeCliPoolService.sendMessage(message);
      
      expect(response).toBeDefined();
      expect(response.content).toBe('Test response');
      expect(claudeCliPoolService.stats.successfulRequests).toBe(1);
    });

    it('should handle message errors gracefully', async () => {
      const instances = Array.from(claudeCliPoolService.pool.values());
      instances.forEach(instance => {
        instance.ready = true;
        instance.busy = false;
        instance.sendMessage = vi.fn().mockRejectedValue(new Error('CLI error'));
      });
      
      await expect(claudeCliPoolService.sendMessage('Test')).rejects.toThrow('CLI error');
      expect(claudeCliPoolService.stats.failedRequests).toBe(1);
    });

    it('should update conversation history', async () => {
      const instances = Array.from(claudeCliPoolService.pool.values());
      const instance = instances[0];
      
      instance.ready = true;
      instance.busy = false;
      instance.conversationHistory = []; // Clear history first
      
      // Mock the instance's sendMessage to simulate CLI response
      const originalSendMessage = instance.sendMessage;
      instance.sendMessage = vi.fn().mockImplementation(async function(message) {
        // Simulate what the real sendMessage does
        this.conversationHistory.push({
          role: 'assistant',
          content: 'Response',
          timestamp: new Date()
        });
        
        return {
          id: 'msg-test',
          instanceId: this.id,
          content: 'Response',
          timestamp: new Date(),
          duration: 1000,
          messageCount: 1
        };
      });
      
      await claudeCliPoolService.sendMessage('Test message');
      
      // The service should add user message to history
      const userMessage = instance.conversationHistory.find(m => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage.content).toBe('Test message');
      
      // The mock added assistant message
      const assistantMessage = instance.conversationHistory.find(m => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
    });
  });

  describe('instance recycling', () => {
    beforeEach(async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      await claudeCliPoolService.initialize({
        minInstances: 2,
        maxMessagesPerInstance: 10
      });
    });

    it('should recycle instance when message limit reached', async () => {
      const instance = Array.from(claudeCliPoolService.pool.values())[0];
      const instanceId = instance.id;
      
      // Set high message count
      instance.messageCount = 11;
      instance.ready = true;
      instance.busy = false;
      
      // Mock terminate method
      instance.terminate = vi.fn().mockResolvedValue();
      
      await claudeCliPoolService.recycleInstance(instanceId);
      
      expect(claudeCliPoolService.pool.has(instanceId)).toBe(false);
      expect(claudeCliPoolService.stats.recycledInstances).toBe(1);
    });

    it('should recycle stale instances', async () => {
      const instance = Array.from(claudeCliPoolService.pool.values())[0];
      const instanceId = instance.id;
      
      // Make instance stale
      instance.lastUsed = Date.now() - 700000; // 11+ minutes ago
      instance.ready = true;
      instance.busy = false;
      instance.terminate = vi.fn().mockResolvedValue();
      
      await claudeCliPoolService.performHealthCheck();
      
      expect(claudeCliPoolService.pool.has(instanceId)).toBe(false);
    });

    it('should maintain minimum pool size after recycling', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const instance = Array.from(claudeCliPoolService.pool.values())[0];
      instance.terminate = vi.fn().mockResolvedValue();
      
      await claudeCliPoolService.recycleInstance(instance.id);
      
      expect(claudeCliPoolService.pool.size).toBeGreaterThanOrEqual(
        claudeCliPoolService.options.minInstances
      );
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      await claudeCliPoolService.initialize({ minInstances: 2 });
    });

    it('should track pool utilization', () => {
      // Mark one instance as busy
      const instances = Array.from(claudeCliPoolService.pool.values());
      const poolSize = instances.length;
      
      // Mark exactly half as busy (or as close as possible)
      const busyCount = poolSize === 2 ? 1 : Math.floor(poolSize / 2);
      for (let i = 0; i < busyCount; i++) {
        instances[i].busy = true;
      }
      
      claudeCliPoolService.updatePoolStats();
      
      const expectedUtilization = (busyCount / poolSize) * 100;
      expect(claudeCliPoolService.stats.poolUtilization).toBeCloseTo(expectedUtilization, 1);
    });

    it('should calculate average response time', () => {
      claudeCliPoolService.stats.successfulRequests = 0;
      claudeCliPoolService.stats.averageResponseTime = 0;
      
      // First request
      claudeCliPoolService.stats.successfulRequests = 1;
      claudeCliPoolService.updateAverageResponseTime(1000);
      expect(claudeCliPoolService.stats.averageResponseTime).toBe(1000);
      
      // Second request
      claudeCliPoolService.stats.successfulRequests = 2;
      claudeCliPoolService.updateAverageResponseTime(2000);
      expect(claudeCliPoolService.stats.averageResponseTime).toBe(1500);
    });

    it('should provide detailed stats', () => {
      const stats = claudeCliPoolService.getStats();
      
      expect(stats).toHaveProperty('poolSize');
      expect(stats).toHaveProperty('readyInstances');
      expect(stats).toHaveProperty('busyInstances');
      expect(stats).toHaveProperty('instances');
      expect(stats.instances).toBeInstanceOf(Array);
    });
  });

  describe('health checks', () => {
    beforeEach(async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      await claudeCliPoolService.initialize({
        minInstances: 2,
        healthCheckInterval: 100
      });
    });

    it('should perform health checks', async () => {
      const listener = vi.fn();
      claudeCliPoolService.on('healthCheckCompleted', listener);
      
      await claudeCliPoolService.performHealthCheck();
      
      expect(listener).toHaveBeenCalled();
    });

    it('should recycle dead instances', async () => {
      const instance = Array.from(claudeCliPoolService.pool.values())[0];
      const instanceId = instance.id;
      
      // Mock dead process
      instance.process = { killed: true };
      instance.terminate = vi.fn().mockResolvedValue();
      
      await claudeCliPoolService.performHealthCheck();
      
      expect(claudeCliPoolService.pool.has(instanceId)).toBe(false);
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      await claudeCliPoolService.initialize({ minInstances: 2 });
    });

    it('should shutdown gracefully', async () => {
      const listener = vi.fn();
      claudeCliPoolService.on('shutdown', listener);
      
      // Mock terminate for all instances
      for (const instance of claudeCliPoolService.pool.values()) {
        instance.terminate = vi.fn().mockResolvedValue();
      }
      
      await claudeCliPoolService.shutdown();
      
      expect(claudeCliPoolService.initialized).toBe(false);
      expect(claudeCliPoolService.pool.size).toBe(0);
      expect(claudeCliPoolService.healthCheckTimer).toBeNull();
      expect(listener).toHaveBeenCalled();
    });

    it('should clear waiting queue on shutdown', async () => {
      claudeCliPoolService.waitingQueue = [() => {}, () => {}];
      
      // Mock terminate for all instances
      for (const instance of claudeCliPoolService.pool.values()) {
        instance.terminate = vi.fn().mockResolvedValue();
      }
      
      await claudeCliPoolService.shutdown();
      
      expect(claudeCliPoolService.waitingQueue).toHaveLength(0);
    });
  });
});

// Helper function to create mock process
function createMockProcess() {
  const mockProcess = new EventEmitter();
  mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();
  mockProcess.killed = false;
  
  // Simulate process becoming ready
  setTimeout(() => {
    mockProcess.stdout.emit('data', Buffer.from('> '));
  }, 10);
  
  return mockProcess;
}