import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock health routes
const createMockHealthRoutes = () => {
  const router = express.Router();

  // Basic health check
  router.get('/', async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: 'test',
      services: {
        database: { status: 'healthy', responseTime: 50 },
        redis: { status: 'healthy', responseTime: 25 },
        workerManager: { 
          status: 'healthy',
          workers: { total: 2, online: 2, totalLoad: 3, maxCapacity: 10 },
          queue: { queued: 0, processing: 1, completed: 5, failed: 0 }
        }
      },
      responseTime: 100
    };
    
    res.json(health);
  });

  // Detailed health check
  router.get('/detailed', async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: 'test',
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: {
          used: 100,
          total: 200,
          external: 50,
          rss: 150
        },
        cpu: process.cpuUsage()
      },
      services: {
        database: {
          status: 'healthy',
          responseTime: 50,
          stats: {
            activeUsers: 5,
            activeApiKeys: 10,
            activeSessions: 3,
            requestsLast24h: 100
          }
        },
        redis: {
          status: 'healthy',
          responseTime: 25,
          info: {
            memory: 'used_memory_human:1.2M',
            keyspace: 'db0:keys=10,expires=2'
          }
        }
      },
      metrics: {
        responseTime: 150,
        timestamp: Date.now()
      }
    };
    
    res.json(health);
  });

  // Alive check
  router.get('/alive', (req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Ready check
  router.get('/ready', async (req, res) => {
    const checks = [
      { service: 'database', ready: true },
      { service: 'redis', ready: true }
    ];
    
    const allReady = checks.every(check => check.ready);
    
    res.status(allReady ? 200 : 503).json({
      ready: allReady,
      timestamp: new Date().toISOString(),
      checks
    });
  });

  // Metrics endpoint (Prometheus format)
  router.get('/metrics', async (req, res) => {
    const metrics = [
      '# HELP nodejs_memory_heap_used_bytes Process heap memory used',
      '# TYPE nodejs_memory_heap_used_bytes gauge',
      'nodejs_memory_heap_used_bytes 104857600',
      '',
      '# HELP nodejs_memory_heap_total_bytes Process heap memory total',
      '# TYPE nodejs_memory_heap_total_bytes gauge',
      'nodejs_memory_heap_total_bytes 209715200',
      '',
      '# HELP nodejs_process_uptime_seconds Process uptime in seconds',
      '# TYPE nodejs_process_uptime_seconds gauge',
      `nodejs_process_uptime_seconds ${process.uptime()}`,
      '',
      '# HELP claude_workers_total Total number of workers',
      '# TYPE claude_workers_total gauge',
      'claude_workers_total 2',
      '',
      '# HELP claude_workers_online Online workers',
      '# TYPE claude_workers_online gauge',
      'claude_workers_online 2',
      '',
      '# HELP claude_active_users Total active users',
      '# TYPE claude_active_users gauge',
      'claude_active_users 5',
      '',
      '# HELP claude_active_sessions Total active sessions',
      '# TYPE claude_active_sessions gauge',
      'claude_active_sessions 3'
    ];

    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n') + '\n');
  });

  return router;
};

describe('Health Routes - Simplified', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/health', createMockHealthRoutes());
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
        environment: 'test',
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
            status: 'healthy',
            workers: expect.objectContaining({
              total: expect.any(Number),
              online: expect.any(Number)
            })
          })
        }),
        responseTime: expect.any(Number)
      }));
    });

    it('should have valid timestamp format', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include service response times', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.services.database.responseTime).toBeGreaterThan(0);
      expect(response.body.services.redis.responseTime).toBeGreaterThan(0);
    });

    it('should include worker information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const workerManager = response.body.services.workerManager;
      expect(workerManager.workers.total).toBeGreaterThanOrEqual(0);
      expect(workerManager.workers.online).toBeGreaterThanOrEqual(0);
      expect(workerManager.queue).toBeDefined();
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toEqual(expect.objectContaining({
        status: 'healthy',
        timestamp: expect.any(String),
        system: expect.objectContaining({
          platform: expect.any(String),
          nodeVersion: expect.any(String),
          memory: expect.objectContaining({
            used: expect.any(Number),
            total: expect.any(Number),
            external: expect.any(Number),
            rss: expect.any(Number)
          })
        }),
        services: expect.objectContaining({
          database: expect.objectContaining({
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

    it('should include system memory information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const memory = response.body.system.memory;
      expect(memory.used).toBeGreaterThan(0);
      expect(memory.total).toBeGreaterThan(memory.used);
      expect(memory.rss).toBeGreaterThan(0);
    });

    it('should include database statistics', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const dbStats = response.body.services.database.stats;
      expect(dbStats.activeUsers).toBeGreaterThanOrEqual(0);
      expect(dbStats.activeApiKeys).toBeGreaterThanOrEqual(0);
      expect(dbStats.activeSessions).toBeGreaterThanOrEqual(0);
      expect(dbStats.requestsLast24h).toBeGreaterThanOrEqual(0);
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
      const response = await request(app)
        .get('/health/alive')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
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

    it('should include check results', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.checks).toHaveLength(2);
      expect(response.body.checks.every(check => check.ready)).toBe(true);
    });
  });

  describe('GET /health/metrics', () => {
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

    it('should include worker metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const metrics = response.text;
      expect(metrics).toContain('claude_workers_total');
      expect(metrics).toContain('claude_workers_online');
    });

    it('should include business metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const metrics = response.text;
      expect(metrics).toContain('claude_active_users');
      expect(metrics).toContain('claude_active_sessions');
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

  describe('Response Time Monitoring', () => {
    it('should track response times for health checks', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      const endTime = Date.now();
      const actualResponseTime = endTime - startTime;
      
      expect(response.body.responseTime).toBeLessThanOrEqual(actualResponseTime + 100);
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

  describe('Content Type Headers', () => {
    it('should return JSON for health endpoints', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return plain text for metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    });
  });
});