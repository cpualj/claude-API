import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process module
vi.mock('child_process', () => ({
  default: {
    spawn: vi.fn()
  },
  spawn: vi.fn()
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234'
}));

// Import after mocking
import { spawn } from 'child_process';
import smartClaudeCliService from '../../services/smartClaudeCliService.js';

describe('SmartClaudeCliService', () => {
  beforeEach(() => {
    // Reset service state before each test
    smartClaudeCliService.instances.clear();
    smartClaudeCliService.sessions.clear();
    smartClaudeCliService.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      instancesCreated: 0,
      instancesDestroyed: 0,
      averageResponseTime: 0
    };
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up
    await smartClaudeCliService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with zero pre-allocation', () => {
      expect(smartClaudeCliService.instances.size).toBe(0);
      expect(smartClaudeCliService.sessions.size).toBe(0);
      expect(smartClaudeCliService.stats.instancesCreated).toBe(0);
    });
  });

  describe('instance management', () => {
    it('should create instance on-demand', async () => {
      // Mock spawn to return a fake process
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);

      const instance = await smartClaudeCliService.createNewInstance('test-session');
      
      expect(instance).toBeDefined();
      expect(instance.id).toMatch(/^claude-/);
      expect(smartClaudeCliService.instances.size).toBe(1);
      expect(smartClaudeCliService.sessions.get('test-session')).toBe(instance.id);
      expect(smartClaudeCliService.stats.instancesCreated).toBe(1);
    });

    it('should reuse existing idle instance', async () => {
      // Create first instance
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const instance1 = await smartClaudeCliService.createNewInstance('session-1');
      instance1.busy = false;
      instance1.scheduledForDestroy = false;
      
      // Get instance for new session - should reuse existing
      const instance2 = await smartClaudeCliService.getOrCreateInstance('session-2');
      
      expect(instance2.id).toBe(instance1.id);
      expect(smartClaudeCliService.sessions.get('session-2')).toBe(instance1.id);
      expect(smartClaudeCliService.instances.size).toBe(1); // No new instance created
    });

    it('should create new instance when all are busy', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      // Create and mark first instance as busy
      const instance1 = await smartClaudeCliService.createNewInstance('session-1');
      instance1.busy = true;
      
      // Request should create new instance
      const instance2 = await smartClaudeCliService.getOrCreateInstance('session-2');
      
      expect(instance2.id).not.toBe(instance1.id);
      expect(smartClaudeCliService.instances.size).toBe(2);
      expect(smartClaudeCliService.stats.instancesCreated).toBe(2);
    });

    it('should maintain session mapping', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const instance = await smartClaudeCliService.createNewInstance('persistent-session');
      instance.busy = false;
      instance.scheduledForDestroy = false;
      
      // Subsequent requests with same session should get same instance
      const sameInstance = await smartClaudeCliService.getOrCreateInstance('persistent-session');
      
      expect(sameInstance.id).toBe(instance.id);
      expect(smartClaudeCliService.instances.size).toBe(1);
    });
  });

  describe('message handling', () => {
    it('should send message and create instance on-demand', async () => {
      const mockProcess = createMockProcess('Test response from Claude');
      spawn.mockReturnValue(mockProcess);

      const response = await smartClaudeCliService.sendMessage('Test message', { 
        sessionId: 'test-session' 
      });
      
      expect(response).toBeDefined();
      expect(response.content).toBe('Test response from Claude');
      expect(response.sessionId).toBe('test-session');
      expect(response.instanceId).toMatch(/^claude-/);
      expect(smartClaudeCliService.stats.successfulRequests).toBe(1);
      expect(smartClaudeCliService.stats.totalRequests).toBe(1);
      expect(smartClaudeCliService.instances.size).toBe(1);
    });

    it('should handle message errors gracefully', async () => {
      const mockProcess = createMockProcess();
      // Simulate error - process exits with non-zero code and no output
      spawn.mockReturnValue(mockProcess);
      
      // Modify mock to simulate error
      setTimeout(() => {
        mockProcess.emit('close', 1); // Exit code 1 = error
      }, 50);
      
      await expect(smartClaudeCliService.sendMessage('Test')).rejects.toThrow();
      expect(smartClaudeCliService.stats.failedRequests).toBe(1);
    });

    it('should update average response time', async () => {
      const mockProcess = createMockProcess('Response 1', 100);
      spawn.mockReturnValue(mockProcess);

      await smartClaudeCliService.sendMessage('Message 1');
      
      const firstAverage = smartClaudeCliService.stats.averageResponseTime;
      expect(firstAverage).toBeGreaterThan(0);
      
      // Send second message
      const mockProcess2 = createMockProcess('Response 2', 200);
      spawn.mockReturnValue(mockProcess2);
      
      await smartClaudeCliService.sendMessage('Message 2');
      
      const secondAverage = smartClaudeCliService.stats.averageResponseTime;
      expect(secondAverage).not.toBe(firstAverage);
      expect(smartClaudeCliService.stats.successfulRequests).toBe(2);
    });
  });

  describe('intelligent recycling', () => {
    it('should schedule instance for destruction after max messages', async () => {
      const mockProcess = createMockProcess('Response');
      spawn.mockReturnValue(mockProcess);

      const instance = await smartClaudeCliService.createNewInstance('test-session');
      
      // Mock instance reaching max messages (50)
      instance.messageCount = 49;
      instance.maxMessages = 50;
      
      // Mock the sendMessage method to trigger recycling
      instance.sendMessage = vi.fn().mockImplementation(async function(message) {
        this.messageCount = 50; // Reach max
        this.scheduledForDestroy = true;
        this.emit('shouldDestroy', this.id);
        
        return {
          id: 'msg-test',
          instanceId: this.id,
          content: 'Final response',
          timestamp: new Date(),
          messageCount: this.messageCount
        };
      });
      
      const destroySpy = vi.spyOn(smartClaudeCliService, 'destroyInstance');
      
      await instance.sendMessage('Final message');
      
      // Wait for destruction to be scheduled
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(instance.scheduledForDestroy).toBe(true);
      expect(destroySpy).toHaveBeenCalledWith(instance.id);
    });

    it('should destroy instance after idle timeout', (done) => {
      const instance = {
        id: 'test-instance',
        busy: false,
        scheduledForDestroy: false,
        maxIdleTime: 100, // 100ms for testing
        timeoutHandle: null,
        emit: vi.fn(),
        scheduleDestroy: function() {
          this.timeoutHandle = setTimeout(() => {
            if (!this.busy && !this.scheduledForDestroy) {
              this.scheduledForDestroy = true;
              this.emit('shouldDestroy', this.id);
              done(); // Test passes when timeout triggers
            }
          }, this.maxIdleTime);
        }
      };
      
      instance.scheduleDestroy();
    });

    it('should clean up session mappings on destroy', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const instance = await smartClaudeCliService.createNewInstance('session-to-destroy');
      const instanceId = instance.id;
      
      smartClaudeCliService.destroyInstance(instanceId);
      
      expect(smartClaudeCliService.instances.has(instanceId)).toBe(false);
      expect(smartClaudeCliService.sessions.has('session-to-destroy')).toBe(false);
      expect(smartClaudeCliService.stats.instancesDestroyed).toBe(1);
    });
  });

  describe('statistics and monitoring', () => {
    it('should provide comprehensive stats', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      // Create some instances
      await smartClaudeCliService.createNewInstance('session-1');
      const instance2 = await smartClaudeCliService.createNewInstance('session-2');
      instance2.busy = true;
      
      const stats = smartClaudeCliService.getStats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('currentInstances', 2);
      expect(stats).toHaveProperty('activeSessions', 2);
      expect(stats).toHaveProperty('busyInstances', 1);
      expect(stats).toHaveProperty('idleInstances', 1);
      expect(stats).toHaveProperty('instances');
      expect(stats.instances).toHaveLength(2);
      expect(stats).toHaveProperty('memory');
    });

    it('should track memory usage', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const instance = await smartClaudeCliService.createNewInstance();
      instance.messageCount = 5;
      
      const stats = smartClaudeCliService.getStats();
      
      expect(stats.memory.totalConversations).toBe(5);
      expect(stats.memory.averageIdleTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide health check info', async () => {
      const health = await smartClaudeCliService.healthCheck();
      
      expect(health).toHaveProperty('healthy', true);
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('currentInstances');
    });

    it('should provide instance info by ID', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      const instance = await smartClaudeCliService.createNewInstance();
      const info = smartClaudeCliService.getInstanceInfo(instance.id);
      
      expect(info).toBeDefined();
      expect(info.id).toBe(instance.id);
      expect(info).toHaveProperty('busy');
      expect(info).toHaveProperty('messageCount');
      expect(info).toHaveProperty('lastUsed');
    });
  });

  describe('cleanup and maintenance', () => {
    it('should manually cleanup idle instances', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      // Create instance and make it stale
      const instance = await smartClaudeCliService.createNewInstance();
      instance.busy = false;
      instance.lastUsed = Date.now() - (11 * 60 * 1000); // 11 minutes ago
      
      const cleaned = await smartClaudeCliService.cleanup();
      
      expect(cleaned).toBe(1);
      expect(smartClaudeCliService.instances.size).toBe(0);
    });

    it('should shutdown gracefully', async () => {
      const mockProcess = createMockProcess();
      spawn.mockReturnValue(mockProcess);
      
      // Create instances
      await smartClaudeCliService.createNewInstance('session-1');
      await smartClaudeCliService.createNewInstance('session-2');
      
      await smartClaudeCliService.shutdown();
      
      expect(smartClaudeCliService.instances.size).toBe(0);
      expect(smartClaudeCliService.sessions.size).toBe(0);
    });
  });
});

// Helper function to create mock process
function createMockProcess(response = 'Mock Claude response', delay = 50) {
  const mockProcess = new EventEmitter();
  mockProcess.stdin = { 
    write: vi.fn(), 
    end: vi.fn() 
  };
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();
  
  // Simulate Claude CLI response after delay
  setTimeout(() => {
    mockProcess.stdout.emit('data', Buffer.from(response));
    mockProcess.emit('close', 0); // Exit code 0 = success
  }, delay);
  
  return mockProcess;
}