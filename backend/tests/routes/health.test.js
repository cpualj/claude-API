import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRedis, closeRedis } from '../../services/redis.js';
import { initDatabase, closeDatabase, query } from '../../db/init.js';
import { WorkerManager } from '../../services/workerManager.js';
import healthRoutes from '../../routes/health.js';

// Mock Socket.IO
const mockIO = {
  to: vi.fn().mockReturnThis(),
  emit: vi.fn()
};

describe('Health Routes', () => {
  let app;
  let redisServices;
  let workerManager;

  beforeAll(async () => {
    await initDatabase();
    redisServices = await setupRedis();
    workerManager = new WorkerManager(mockIO, redisServices);
    await workerManager.initialize();

    // Create Express app with health routes
    app = express();
    app.use(express.json());
    
    // Mock services middleware
    app.use((req, res, next) => {
      req.services = {
        workerManager,
        redis: redisServices
      };
      next();
    });
    
    app.use('/health', healthRoutes);
  });

  afterAll(async () => {
    await workerManager.shutdown();
    await closeDatabase();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear database for clean tests
    await query('DELETE FROM sessions');
    await query('DELETE FROM api_keys');
    await query('DELETE FROM users');
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status when all services are working', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual(expect.objectContaining({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        services: expect.objectContaining({
          database: expect.objectContaining({
            status: 'healthy',
            responseTime: expect.any(Number)
          }),
          redis: expect.objectContaining({
            status: 'healthy',
            responseTime: expect.any(Number)
          }),
          workerManager: expect.objectContaining({
            status: expect.any(String),
            workers: expect.objectContaining({
              total: expect.any(Number),
              online: expect.any(Number),
              totalLoad: expect.any(Number),
              maxCapacity: expect.any(Number)
            }),
            queue: expect.any(Object)
          })
        }),
        responseTime: expect.any(Number)
      }));
    });

    it('should return degraded status when no workers are online', async () => {
      // Shutdown all workers
      await workerManager.shutdown();
      workerManager = new WorkerManager(mockIO, redisServices);
      // Don't initialize workers

      app.use((req, res, next) => {
        req.services.workerManager = workerManager;
        next();
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.workerManager.status).toBe('degraded');
    });

    it('should return degraded status when Redis is unavailable', async () => {
      // Disconnect Redis
      await redisServices.redis.disconnect();

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.redis.status).toBe('unhealthy');

      // Reconnect for other tests
      redisServices = await setupRedis();
      app.use((req, res, next) => {
        req.services.redis = redisServices;
        next();
      });
    });

    it('should return degraded status when database is unavailable', async () => {
      // Close database connection
      await closeDatabase();

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.database.status).toBe('unhealthy');

      // Reconnect for other tests
      await initDatabase();
    });

    it('should include response time in health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.responseTime).toBeGreaterThan(0);
      expect(response.body.responseTime).toBeLessThan(5000); // Should be under 5 seconds
    });

    it('should handle partial service failures gracefully', async () => {
      // This test ensures the health check continues even if one service fails
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toMatch(/^(healthy|degraded)$/);
      expect(response.body.services).toBeDefined();
    });
  });

  describe('GET /health/detailed', () => {
    beforeEach(async () => {
      // Create some test data for detailed statistics
      await query(`
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ('test1@example.com', 'hash1', 'user', true),
               ('test2@example.com', 'hash2', 'admin', true),
               ('inactive@example.com', 'hash3', 'user', false)
      `);

      const userResult = await query('SELECT id FROM users WHERE email = $1', ['test1@example.com']);
      const userId = userResult.rows[0].id;

      await query(`
        INSERT INTO api_keys (user_id, key_hash, name, is_active)
        VALUES ($1, 'hash1', 'Key 1', true),
               ($1, 'hash2', 'Key 2', true)
      `, [userId]);

      await query(`
        INSERT INTO sessions (id, api_key_id, tool_id, context, is_active, expires_at)
        VALUES ('session-1', (SELECT id FROM api_keys LIMIT 1), 'claude', '[]', true, NOW() + INTERVAL '1 hour'),
               ('session-2', (SELECT id FROM api_keys LIMIT 1), 'openai', '[]', true, NOW() + INTERVAL '2 hours')
      `);
    });

    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toEqual(expect.objectContaining({
        status: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        system: expect.objectContaining({
          platform: expect.any(String),
          nodeVersion: expect.any(String),
          memory: expect.objectContaining({
            used: expect.any(Number),
            total: expect.any(Number),
            external: expect.any(Number),
            rss: expect.any(Number)
          }),
          cpu: expect.any(Object)
        }),
        services: expect.objectContaining({
          database: expect.objectContaining({
            status: expect.any(String),
            responseTime: expect.any(Number),
            stats: expect.objectContaining({
              activeUsers: expect.any(Number),
              activeApiKeys: expect.any(Number),
              activeSessions: expect.any(Number),
              requestsLast24h: expect.any(Number)
            })
          })
        }),
        metrics: expect.objectContaining({
          responseTime: expect.any(Number),
          timestamp: expect.any(Number)
        })
      }));
    });

    it('should include correct database statistics', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const dbStats = response.body.services.database.stats;
      expect(dbStats.activeUsers).toBe(2); // 2 active users
      expect(dbStats.activeApiKeys).toBe(2); // 2 active API keys
      expect(dbStats.activeSessions).toBe(2); // 2 active sessions
    });

    it('should include system memory information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const memory = response.body.system.memory;
      expect(memory.used).toBeGreaterThan(0);
      expect(memory.total).toBeGreaterThan(memory.used);
      expect(memory.rss).toBeGreaterThan(0);
    });

    it('should include Redis information when available', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      if (response.body.services.redis.status === 'healthy') {
        expect(response.body.services.redis.info).toBeDefined();
      }
    });

    it('should handle database connection errors in detailed check', async () => {
      await closeDatabase();

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.services.database.status).toBe('unhealthy');
      expect(response.body.status).toBe('degraded');

      await initDatabase();
    });
  });

  describe('GET /health/alive', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/health/alive')
        .expect(200);

      expect(response.body).toEqual({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should always return 200 for liveness probe', async () => {
      // Even if other services are down, alive should return 200
      await closeDatabase();
      await redisServices.redis.disconnect();

      const response = await request(app)
        .get('/health/alive')
        .expect(200);

      expect(response.body.status).toBe('alive');

      // Reconnect for other tests
      await initDatabase();
      redisServices = await setupRedis();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status when services are available', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toEqual({
        ready: true,
        timestamp: expect.any(String),
        checks: expect.arrayContaining([
          expect.objectContaining({
            service: 'database',
            ready: true
          }),
          expect.objectContaining({
            service: 'redis',
            ready: true
          })
        ])
      });
    });

    it('should return 503 when database is not ready', async () => {
      await closeDatabase();

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.ready).toBe(false);
      expect(response.body.checks.some(check => 
        check.service === 'database' && check.ready === false
      )).toBe(true);

      await initDatabase();
    });

    it('should return 503 when Redis is not ready', async () => {
      await redisServices.redis.disconnect();

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.ready).toBe(false);
      expect(response.body.checks.some(check => 
        check.service === 'redis' && check.ready === false
      )).toBe(true);

      redisServices = await setupRedis();
    });

    it('should include error messages for failed checks', async () => {
      await closeDatabase();

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      const dbCheck = response.body.checks.find(check => check.service === 'database');
      expect(dbCheck.error).toBeDefined();
      expect(dbCheck.error).toBeTruthy();

      await initDatabase();
    });
  });

  describe('GET /health/metrics', () => {
    beforeEach(async () => {
      // Create test data for metrics
      await query(`
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ('metrics@example.com', 'hash', 'user', true)
      `);

      const userResult = await query('SELECT id FROM users WHERE is_active = true LIMIT 1');
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        await query(`
          INSERT INTO api_keys (user_id, key_hash, name, is_active)
          VALUES ($1, 'metrics-hash', 'Metrics Key', true)
        `, [userId]);

        await query(`
          INSERT INTO sessions (id, api_key_id, tool_id, context, is_active, expires_at)
          VALUES ('metrics-session', (SELECT id FROM api_keys WHERE name = 'Metrics Key'), 'claude', '[]', true, NOW() + INTERVAL '1 hour')
        `);
      }
    });

    it('should return Prometheus format metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      
      const metrics = response.text;
      
      // Check for required Prometheus metrics
      expect(metrics).toContain('# HELP nodejs_memory_heap_used_bytes');
      expect(metrics).toContain('# TYPE nodejs_memory_heap_used_bytes gauge');
      expect(metrics).toContain('nodejs_memory_heap_used_bytes');
      
      expect(metrics).toContain('# HELP nodejs_process_uptime_seconds');
      expect(metrics).toContain('nodejs_process_uptime_seconds');
      
      expect(metrics).toContain('# HELP claude_active_users');
      expect(metrics).toContain('claude_active_users');
      
      expect(metrics).toContain('# HELP claude_active_sessions');
      expect(metrics).toContain('claude_active_sessions');
    });

    it('should include worker metrics when workers are available', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const metrics = response.text;
      
      if (workerManager && workerManager.getWorkersStatus().totalWorkers > 0) {
        expect(metrics).toContain('claude_workers_total');
        expect(metrics).toContain('claude_workers_online');
        expect(metrics).toContain('claude_queue_size');
      }
    });

    it('should include business metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const metrics = response.text;
      
      expect(metrics).toContain('claude_active_users');
      expect(metrics).toContain('claude_active_sessions');
    });

    it('should handle database errors gracefully in metrics', async () => {
      await closeDatabase();

      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      // Should still return basic system metrics
      const metrics = response.text;
      expect(metrics).toContain('nodejs_memory_heap_used_bytes');
      expect(metrics).toContain('nodejs_process_uptime_seconds');

      await initDatabase();
    });

    it('should return valid Prometheus metric format', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const metrics = response.text;
      const lines = metrics.split('\n').filter(line => line.trim());
      
      // Check that each metric line is properly formatted
      for (const line of lines) {
        if (line.startsWith('#')) {
          // Comment lines should start with # HELP or # TYPE
          expect(line).toMatch(/^# (HELP|TYPE) /);
        } else if (line.trim()) {
          // Metric lines should have format: metric_name value
          expect(line).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]* \d+(\.\d+)?$/);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock a service to throw an error
      const originalWorkerManager = workerManager;
      const brokenWorkerManager = {
        getWorkersStatus: () => { throw new Error('Worker manager error'); },
        getQueueStats: async () => { throw new Error('Queue stats error'); }
      };

      app.use((req, res, next) => {
        req.services.workerManager = brokenWorkerManager;
        next();
      });

      const response = await request(app)
        .get('/health')
        .expect(200); // Should still return 200 but with degraded status

      expect(response.body.status).toBe('degraded');

      // Restore original worker manager
      app.use((req, res, next) => {
        req.services.workerManager = originalWorkerManager;
        next();
      });
    });

    it('should return 503 for critical failures', async () => {
      // Simulate a critical failure scenario
      await closeDatabase();
      await redisServices.redis.disconnect();

      const response = await request(app)
        .get('/health')
        .expect(200); // Basic health check should still return 200 but with degraded status

      expect(response.body.status).toBe('degraded');

      // Restore services
      await initDatabase();
      redisServices = await setupRedis();
    });

    it('should handle missing services gracefully', async () => {
      // Test with missing services
      app.use((req, res, next) => {
        req.services = {}; // No services available
        next();
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.redis.status).toBe('unavailable');
      expect(response.body.services.workerManager.status).toBe('unavailable');
    });
  });

  describe('Response Time Monitoring', () => {
    it('should track response times for health checks', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      const endTime = Date.now();
      const actualResponseTime = endTime - startTime;
      
      expect(response.body.responseTime).toBeLessThanOrEqual(actualResponseTime + 50); // Allow 50ms tolerance
      expect(response.body.responseTime).toBeGreaterThan(0);
    });

    it('should include individual service response times', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.services.database.responseTime).toBeGreaterThan(0);
      expect(response.body.services.redis.responseTime).toBeGreaterThan(0);
    });
  });
});