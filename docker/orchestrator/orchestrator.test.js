import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

// LoadBalancer class (extracted for testing)
class LoadBalancer extends EventEmitter {
  constructor(workers) {
    super();
    this.workers = workers;
    this.currentIndex = 0;
    this.healthChecks = new Map();
    this.workerStats = new Map();
    
    // Initialize worker stats
    workers.forEach(worker => {
      this.workerStats.set(worker.id, {
        requests: 0,
        errors: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        lastUsed: null,
        healthy: true,
        currentLoad: 0
      });
    });
  }

  getNextWorker(strategy = 'round-robin') {
    const healthyWorkers = this.workers.filter(w => {
      const stats = this.workerStats.get(w.id);
      return stats.healthy && stats.currentLoad === 0;
    });

    if (healthyWorkers.length === 0) {
      return this.getLeastLoadedWorker();
    }

    switch (strategy) {
      case 'round-robin':
        const worker = healthyWorkers[this.currentIndex % healthyWorkers.length];
        this.currentIndex++;
        return worker;
        
      case 'least-connections':
        return this.getLeastLoadedWorker(healthyWorkers);
        
      case 'weighted':
        return this.getWeightedWorker(healthyWorkers);
        
      case 'response-time':
        return this.getFastestWorker(healthyWorkers);
        
      default:
        return healthyWorkers[0];
    }
  }

  getLeastLoadedWorker(workers = this.workers) {
    let minLoad = Infinity;
    let selectedWorker = null;
    
    for (const worker of workers) {
      const stats = this.workerStats.get(worker.id);
      if (stats.healthy && stats.currentLoad < minLoad) {
        minLoad = stats.currentLoad;
        selectedWorker = worker;
      }
    }
    
    return selectedWorker;
  }

  getWeightedWorker(workers) {
    const totalWeight = workers.reduce((sum, w) => sum + (w.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const worker of workers) {
      random -= (worker.weight || 1);
      if (random <= 0) {
        return worker;
      }
    }
    
    return workers[0];
  }

  getFastestWorker(workers) {
    let minResponseTime = Infinity;
    let selectedWorker = workers[0];
    
    for (const worker of workers) {
      const stats = this.workerStats.get(worker.id);
      if (stats.averageResponseTime < minResponseTime) {
        minResponseTime = stats.averageResponseTime;
        selectedWorker = worker;
      }
    }
    
    return selectedWorker;
  }

  updateWorkerStats(workerId, responseTime, success) {
    const stats = this.workerStats.get(workerId);
    if (stats) {
      stats.requests++;
      stats.lastUsed = new Date();
      
      if (success) {
        stats.totalResponseTime += responseTime;
        stats.averageResponseTime = stats.totalResponseTime / stats.requests;
        stats.currentLoad = Math.max(0, stats.currentLoad - 1);
      } else {
        stats.errors++;
      }
    }
  }

  getStats() {
    const stats = {};
    this.workerStats.forEach((value, key) => {
      stats[key] = { ...value };
    });
    return stats;
  }
}

describe('LoadBalancer', () => {
  let loadBalancer;
  let workers;

  beforeEach(() => {
    workers = [
      { id: 'worker1', url: 'http://worker1:4001', weight: 1 },
      { id: 'worker2', url: 'http://worker2:4002', weight: 2 },
      { id: 'worker3', url: 'http://worker3:4003', weight: 1 }
    ];
    loadBalancer = new LoadBalancer(workers);
  });

  describe('getNextWorker', () => {
    it('should use round-robin strategy by default', () => {
      const worker1 = loadBalancer.getNextWorker();
      const worker2 = loadBalancer.getNextWorker();
      const worker3 = loadBalancer.getNextWorker();
      const worker4 = loadBalancer.getNextWorker();

      expect(worker1.id).toBe('worker1');
      expect(worker2.id).toBe('worker2');
      expect(worker3.id).toBe('worker3');
      expect(worker4.id).toBe('worker1'); // Back to first worker
    });

    it('should skip unhealthy workers', () => {
      // Mark worker2 as unhealthy
      loadBalancer.workerStats.get('worker2').healthy = false;

      const worker1 = loadBalancer.getNextWorker();
      const worker2 = loadBalancer.getNextWorker();

      expect(worker1.id).toBe('worker1');
      expect(worker2.id).toBe('worker3'); // Skips worker2
    });

    it('should use least-connections strategy', () => {
      // Set different loads
      loadBalancer.workerStats.get('worker1').currentLoad = 2;
      loadBalancer.workerStats.get('worker2').currentLoad = 1;
      loadBalancer.workerStats.get('worker3').currentLoad = 3;

      const worker = loadBalancer.getNextWorker('least-connections');
      expect(worker.id).toBe('worker2'); // Least loaded
    });

    it('should use weighted strategy', () => {
      // Mock Math.random to test weighted distribution
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.6); // Should select worker2 (weight=2)

      const worker = loadBalancer.getNextWorker('weighted');
      expect(worker.id).toBe('worker2');

      Math.random = originalRandom;
    });

    it('should use response-time strategy', () => {
      // Set different response times
      loadBalancer.workerStats.get('worker1').averageResponseTime = 100;
      loadBalancer.workerStats.get('worker2').averageResponseTime = 50;
      loadBalancer.workerStats.get('worker3').averageResponseTime = 150;

      const worker = loadBalancer.getNextWorker('response-time');
      expect(worker.id).toBe('worker2'); // Fastest response time
    });
  });

  describe('updateWorkerStats', () => {
    it('should update stats on successful request', () => {
      loadBalancer.workerStats.get('worker1').currentLoad = 1;
      
      loadBalancer.updateWorkerStats('worker1', 100, true);
      
      const stats = loadBalancer.workerStats.get('worker1');
      expect(stats.requests).toBe(1);
      expect(stats.totalResponseTime).toBe(100);
      expect(stats.averageResponseTime).toBe(100);
      expect(stats.currentLoad).toBe(0);
      expect(stats.errors).toBe(0);
    });

    it('should update stats on failed request', () => {
      loadBalancer.updateWorkerStats('worker1', 0, false);
      
      const stats = loadBalancer.workerStats.get('worker1');
      expect(stats.requests).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.totalResponseTime).toBe(0);
    });

    it('should calculate running average correctly', () => {
      loadBalancer.updateWorkerStats('worker1', 100, true);
      loadBalancer.updateWorkerStats('worker1', 200, true);
      loadBalancer.updateWorkerStats('worker1', 300, true);
      
      const stats = loadBalancer.workerStats.get('worker1');
      expect(stats.averageResponseTime).toBe(200); // (100+200+300)/3
    });
  });

  describe('getLeastLoadedWorker', () => {
    it('should return worker with least load', () => {
      loadBalancer.workerStats.get('worker1').currentLoad = 5;
      loadBalancer.workerStats.get('worker2').currentLoad = 2;
      loadBalancer.workerStats.get('worker3').currentLoad = 3;

      const worker = loadBalancer.getLeastLoadedWorker();
      expect(worker.id).toBe('worker2');
    });

    it('should ignore unhealthy workers', () => {
      loadBalancer.workerStats.get('worker1').currentLoad = 1;
      loadBalancer.workerStats.get('worker2').currentLoad = 0;
      loadBalancer.workerStats.get('worker2').healthy = false;
      loadBalancer.workerStats.get('worker3').currentLoad = 2;

      const worker = loadBalancer.getLeastLoadedWorker();
      expect(worker.id).toBe('worker1');
    });
  });

  describe('getStats', () => {
    it('should return copy of all worker stats', () => {
      const stats = loadBalancer.getStats();
      
      expect(stats).toHaveProperty('worker1');
      expect(stats).toHaveProperty('worker2');
      expect(stats).toHaveProperty('worker3');
      
      // Verify it's a copy, not reference
      stats.worker1.requests = 999;
      expect(loadBalancer.workerStats.get('worker1').requests).toBe(0);
    });
  });
});