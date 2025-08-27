import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { WorkerManager } from '../../services/workerManager.js';
import { setupRedis, closeRedis } from '../../services/redis.js';

// Mock Socket.IO
const mockIO = {
  to: vi.fn().mockReturnThis(),
  emit: vi.fn()
};

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn()
  }))
}));

describe('WorkerManager', () => {
  let workerManager;
  let redisServices;

  beforeAll(async () => {
    redisServices = await setupRedis();
    workerManager = new WorkerManager(mockIO, redisServices);
    await workerManager.initialize();
  });

  afterAll(async () => {
    await workerManager.shutdown();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear Redis and reset mocks
    await redisServices.redis.flushdb();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize worker manager successfully', async () => {
      expect(workerManager).toBeDefined();
      expect(workerManager.workers).toBeDefined();
      expect(workerManager.requestQueue).toBeDefined();
      expect(workerManager.workerStatusManager).toBeDefined();
    });

    it('should start local workers on initialization', async () => {
      const status = workerManager.getWorkersStatus();
      expect(status.totalWorkers).toBeGreaterThan(0);
    });
  });

  describe('Worker Management', () => {
    it('should register local workers', async () => {
      const workerId = 'test-worker-1';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        maxLoad: 5,
        currentLoad: 0,
        status: 'online'
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      const worker = await workerManager.workerStatusManager.getWorker(workerId);
      expect(worker).toBeTruthy();
      expect(worker.id).toBe(workerId);
      expect(worker.type).toBe('local');
    });

    it('should remove workers', async () => {
      const workerId = 'test-worker-remove';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        status: 'online'
      };

      await workerManager.registerWorker(workerId, workerInfo);
      const removed = await workerManager.removeWorker(workerId);
      
      expect(removed).toBe(true);
      
      const worker = await workerManager.workerStatusManager.getWorker(workerId);
      expect(worker).toBeNull();
    });

    it('should get workers status', async () => {
      const status = workerManager.getWorkersStatus();
      
      expect(status).toEqual(expect.objectContaining({
        totalWorkers: expect.any(Number),
        onlineWorkers: expect.any(Number),
        totalLoad: expect.any(Number),
        maxCapacity: expect.any(Number)
      }));
    });

    it('should find available workers', async () => {
      const workerId = 'available-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        maxLoad: 5,
        currentLoad: 2,
        status: 'online'
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      const availableWorker = await workerManager.getAvailableWorker('claude');
      expect(availableWorker).toBeTruthy();
      expect(availableWorker.id).toBe(workerId);
    });

    it('should handle worker heartbeats', async () => {
      const workerId = 'heartbeat-worker';
      const workerInfo = {
        id: workerId,
        status: 'online',
        currentLoad: 1
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      await workerManager.updateWorkerHeartbeat(workerId, { currentLoad: 3 });
      
      const worker = await workerManager.workerStatusManager.getWorker(workerId);
      expect(worker.currentLoad).toBe(3);
    });
  });

  describe('Request Processing', () => {
    it('should submit request to available worker', async () => {
      const workerId = 'processing-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        maxLoad: 5,
        currentLoad: 0,
        status: 'online',
        process: {
          stdin: { write: vi.fn(), end: vi.fn() },
          pid: 12345
        }
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      const request = {
        id: 'test-request',
        message: 'Hello, Claude!',
        toolId: 'claude',
        userId: 'user-123'
      };

      const result = await workerManager.submitRequest(request);
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    it('should queue request when no workers available', async () => {
      const request = {
        id: 'queued-request',
        message: 'This should be queued',
        toolId: 'unavailable-tool',
        userId: 'user-123'
      };

      const result = await workerManager.submitRequest(request);
      
      expect(result.status).toBe('queued');
      expect(result.requestId).toBeTruthy();
    });

    it('should handle request timeout', async () => {
      const workerId = 'timeout-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        status: 'online',
        process: {
          stdin: { write: vi.fn(), end: vi.fn() },
          pid: 12345
        }
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      const request = {
        id: 'timeout-request',
        message: 'This will timeout',
        toolId: 'claude',
        userId: 'user-123',
        timeout: 100 // Very short timeout
      };

      // Mock a slow response
      vi.spyOn(workerManager, 'processRequest').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      const result = await workerManager.submitRequest(request);
      expect(result.status).toBe('error');
      expect(result.error).toContain('timeout');
    });
  });

  describe('Queue Management', () => {
    it('should get queue statistics', async () => {
      const stats = await workerManager.getQueueStats();
      
      expect(stats).toEqual(expect.objectContaining({
        queued: expect.any(Number),
        processing: expect.any(Number),
        completed: expect.any(Number),
        failed: expect.any(Number)
      }));
    });

    it('should process queued requests when worker becomes available', async () => {
      // Add a request to queue first
      const request = {
        id: 'queued-for-processing',
        message: 'Queued request',
        toolId: 'claude',
        userId: 'user-123'
      };

      await workerManager.requestQueue.enqueue(request);
      
      // Now register a worker
      const workerId = 'new-available-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        maxLoad: 5,
        currentLoad: 0,
        status: 'online',
        process: {
          stdin: { write: vi.fn(), end: vi.fn() },
          pid: 12345
        }
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      // Trigger queue processing
      await workerManager.processQueuedRequests();
      
      const queueStats = await workerManager.getQueueStats();
      expect(queueStats.processing).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Local Worker Process Management', () => {
    it('should spawn local worker processes', async () => {
      const { spawn } = await import('child_process');
      
      const workerId = await workerManager.spawnLocalWorker('claude');
      expect(workerId).toBeTruthy();
      expect(spawn).toHaveBeenCalled();
    });

    it('should handle worker process errors', async () => {
      const workerId = 'error-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        status: 'online',
        process: new EventEmitter()
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      // Simulate process error
      workerInfo.process.emit('error', new Error('Process failed'));
      
      // Worker should be marked as offline
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const worker = await workerManager.workerStatusManager.getWorker(workerId);
      expect(worker?.status).toBe('offline');
    });

    it('should restart failed workers', async () => {
      const originalWorkerCount = workerManager.getWorkersStatus().totalWorkers;
      
      // Simulate worker failure and restart
      await workerManager.handleWorkerFailure('failed-worker-id');
      
      // Should attempt to maintain worker count
      const newWorkerCount = workerManager.getWorkersStatus().totalWorkers;
      expect(newWorkerCount).toBeGreaterThanOrEqual(originalWorkerCount);
    });
  });

  describe('Real-time Updates', () => {
    it('should emit worker status updates', async () => {
      const workerId = 'status-update-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        status: 'online',
        currentLoad: 2
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      expect(mockIO.to).toHaveBeenCalledWith('workers-status');
      expect(mockIO.emit).toHaveBeenCalledWith('workers-update', expect.any(Object));
    });

    it('should broadcast queue updates', async () => {
      await workerManager.broadcastQueueUpdate();
      
      expect(mockIO.to).toHaveBeenCalledWith('workers-status');
      expect(mockIO.emit).toHaveBeenCalledWith('queue-update', expect.any(Object));
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown gracefully', async () => {
      const testManager = new WorkerManager(mockIO, redisServices);
      await testManager.initialize();
      
      // Should not throw error
      await expect(testManager.shutdown()).resolves.not.toThrow();
    });

    it('should cleanup workers on shutdown', async () => {
      const testManager = new WorkerManager(mockIO, redisServices);
      await testManager.initialize();
      
      const workerId = 'cleanup-worker';
      await testManager.registerWorker(workerId, {
        id: workerId,
        type: 'local',
        status: 'online',
        process: { kill: vi.fn() }
      });
      
      await testManager.shutdown();
      
      // Worker should be removed
      const worker = await testManager.workerStatusManager.getWorker(workerId);
      expect(worker).toBeNull();
    });
  });

  describe('Load Balancing', () => {
    it('should select worker with lowest load', async () => {
      const workers = [
        { id: 'worker-1', currentLoad: 3, maxLoad: 5, status: 'online', toolId: 'claude' },
        { id: 'worker-2', currentLoad: 1, maxLoad: 5, status: 'online', toolId: 'claude' },
        { id: 'worker-3', currentLoad: 4, maxLoad: 5, status: 'online', toolId: 'claude' }
      ];

      for (const worker of workers) {
        await workerManager.registerWorker(worker.id, worker);
      }

      const selected = await workerManager.getAvailableWorker('claude');
      expect(selected.id).toBe('worker-2'); // Lowest load
    });

    it('should not select overloaded workers', async () => {
      const workerId = 'overloaded-worker';
      const workerInfo = {
        id: workerId,
        type: 'local',
        toolId: 'claude',
        maxLoad: 5,
        currentLoad: 5, // At capacity
        status: 'online'
      };

      await workerManager.registerWorker(workerId, workerInfo);
      
      const selected = await workerManager.getAvailableWorker('claude');
      expect(selected?.id).not.toBe(workerId);
    });
  });
});