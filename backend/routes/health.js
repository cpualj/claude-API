import express from 'express';
import { query } from '../db/init.js';

const router = express.Router();

// 基础健康检查
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {}
  };

  try {
    // 检查数据库连接
    const dbStartTime = Date.now();
    try {
      await query('SELECT 1 as test');
      health.services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStartTime
      };
    } catch (dbError) {
      health.services.database = {
        status: 'unhealthy',
        error: dbError.message,
        responseTime: Date.now() - dbStartTime
      };
      health.status = 'degraded';
    }

    // 检查 Redis 连接
    const redisStartTime = Date.now();
    try {
      if (req.services?.redis) {
        await req.services.redis.ping();
        health.services.redis = {
          status: 'healthy',
          responseTime: Date.now() - redisStartTime
        };
      } else {
        health.services.redis = {
          status: 'unavailable',
          message: 'Redis service not initialized'
        };
        health.status = 'degraded';
      }
    } catch (redisError) {
      health.services.redis = {
        status: 'unhealthy',
        error: redisError.message,
        responseTime: Date.now() - redisStartTime
      };
      health.status = 'degraded';
    }

    // 检查 Worker Manager
    if (req.services?.workerManager) {
      const workersStatus = req.services.workerManager.getWorkersStatus();
      const queueStats = await req.services.workerManager.getQueueStats();
      
      health.services.workerManager = {
        status: workersStatus.onlineWorkers > 0 ? 'healthy' : 'degraded',
        workers: {
          total: workersStatus.totalWorkers,
          online: workersStatus.onlineWorkers,
          totalLoad: workersStatus.totalLoad,
          maxCapacity: workersStatus.maxCapacity
        },
        queue: queueStats
      };

      if (workersStatus.onlineWorkers === 0) {
        health.status = 'degraded';
      }
    } else {
      health.services.workerManager = {
        status: 'unavailable',
        message: 'Worker Manager not initialized'
      };
      health.status = 'degraded';
    }

    health.responseTime = Date.now() - startTime;

    // 根据整体状态返回适当的 HTTP 状态码
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

// 详细的健康检查
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    system: {},
    services: {},
    metrics: {}
  };

  try {
    // 系统信息
    health.system = {
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      cpu: process.cpuUsage()
    };

    // 数据库健康检查和统计
    const dbStartTime = Date.now();
    try {
      // 基本连接检查
      await query('SELECT 1 as test');
      
      // 获取数据库统计信息
      const [userCount, apiKeyCount, sessionCount, usageCount] = await Promise.all([
        query('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
        query('SELECT COUNT(*) as count FROM api_keys WHERE is_active = true'),
        query('SELECT COUNT(*) as count FROM sessions WHERE is_active = true AND expires_at > NOW()'),
        query('SELECT COUNT(*) as count FROM usage_logs WHERE created_at >= NOW() - INTERVAL \'24 hours\'')
      ]);

      health.services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStartTime,
        stats: {
          activeUsers: parseInt(userCount.rows[0].count),
          activeApiKeys: parseInt(apiKeyCount.rows[0].count),
          activeSessions: parseInt(sessionCount.rows[0].count),
          requestsLast24h: parseInt(usageCount.rows[0].count)
        }
      };
    } catch (dbError) {
      health.services.database = {
        status: 'unhealthy',
        error: dbError.message,
        responseTime: Date.now() - dbStartTime
      };
      health.status = 'degraded';
    }

    // Redis 健康检查和统计
    const redisStartTime = Date.now();
    try {
      if (req.services?.redis) {
        await req.services.redis.ping();
        
        // 获取 Redis 信息
        const info = await req.services.redis.redis.info('memory');
        const keyspaceInfo = await req.services.redis.redis.info('keyspace');
        
        health.services.redis = {
          status: 'healthy',
          responseTime: Date.now() - redisStartTime,
          info: {
            memory: info.split('\r\n').find(line => line.startsWith('used_memory_human:')),
            keyspace: keyspaceInfo
          }
        };
      } else {
        health.services.redis = {
          status: 'unavailable',
          message: 'Redis service not initialized'
        };
        health.status = 'degraded';
      }
    } catch (redisError) {
      health.services.redis = {
        status: 'unhealthy',
        error: redisError.message,
        responseTime: Date.now() - redisStartTime
      };
      health.status = 'degraded';
    }

    // Worker Manager 详细信息
    if (req.services?.workerManager) {
      const workersStatus = req.services.workerManager.getWorkersStatus();
      const queueStats = await req.services.workerManager.getQueueStats();
      
      health.services.workerManager = {
        status: workersStatus.onlineWorkers > 0 ? 'healthy' : 'degraded',
        workers: workersStatus,
        queue: queueStats
      };

      if (workersStatus.onlineWorkers === 0) {
        health.status = 'degraded';
      }
    } else {
      health.services.workerManager = {
        status: 'unavailable',
        message: 'Worker Manager not initialized'
      };
      health.status = 'degraded';
    }

    // Session Manager 统计
    if (req.services?.sessionManager) {
      const activeCount = await req.services.sessionManager.getActiveSessionCount();
      const cacheStats = await req.services.sessionManager.getCacheStats();
      
      health.services.sessionManager = {
        status: 'healthy',
        activeSessions: activeCount,
        cache: cacheStats
      };
    }

    // API Key Manager 统计
    if (req.services?.apiKeyManager) {
      const cacheStats = req.services.apiKeyManager.getCacheStats();
      
      health.services.apiKeyManager = {
        status: 'healthy',
        cache: cacheStats
      };
    }

    // 系统指标
    health.metrics = {
      responseTime: Date.now() - startTime,
      timestamp: Date.now()
    };

    // 根据整体状态返回适当的 HTTP 状态码
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);

  } catch (error) {
    console.error('Detailed health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

// 存活检查（简单的 ping）
router.get('/alive', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 就绪检查
router.get('/ready', async (req, res) => {
  try {
    // 检查关键服务是否就绪
    const checks = [];

    // 数据库检查
    checks.push(
      query('SELECT 1 as test').then(() => ({ service: 'database', ready: true }))
        .catch(err => ({ service: 'database', ready: false, error: err.message }))
    );

    // Redis 检查
    if (req.services?.redis) {
      checks.push(
        req.services.redis.ping().then(() => ({ service: 'redis', ready: true }))
          .catch(err => ({ service: 'redis', ready: false, error: err.message }))
      );
    }

    const results = await Promise.all(checks);
    const allReady = results.every(result => result.ready);

    const response = {
      ready: allReady,
      timestamp: new Date().toISOString(),
      checks: results
    };

    res.status(allReady ? 200 : 503).json(response);

  } catch (error) {
    console.error('Ready check error:', error);
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 指标端点（Prometheus 格式）
router.get('/metrics', async (req, res) => {
  try {
    const metrics = [];
    const timestamp = Date.now();

    // 系统指标
    const memUsage = process.memoryUsage();
    metrics.push(`# HELP nodejs_memory_heap_used_bytes Process heap memory used`);
    metrics.push(`# TYPE nodejs_memory_heap_used_bytes gauge`);
    metrics.push(`nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`);
    
    metrics.push(`# HELP nodejs_memory_heap_total_bytes Process heap memory total`);
    metrics.push(`# TYPE nodejs_memory_heap_total_bytes gauge`);
    metrics.push(`nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`);

    metrics.push(`# HELP nodejs_process_uptime_seconds Process uptime in seconds`);
    metrics.push(`# TYPE nodejs_process_uptime_seconds gauge`);
    metrics.push(`nodejs_process_uptime_seconds ${process.uptime()}`);

    // 业务指标
    if (req.services?.workerManager) {
      const workersStatus = req.services.workerManager.getWorkersStatus();
      const queueStats = await req.services.workerManager.getQueueStats();

      metrics.push(`# HELP claude_workers_total Total number of workers`);
      metrics.push(`# TYPE claude_workers_total gauge`);
      metrics.push(`claude_workers_total ${workersStatus.totalWorkers}`);

      metrics.push(`# HELP claude_workers_online Online workers`);
      metrics.push(`# TYPE claude_workers_online gauge`);
      metrics.push(`claude_workers_online ${workersStatus.onlineWorkers}`);

      metrics.push(`# HELP claude_queue_size Current queue size`);
      metrics.push(`# TYPE claude_queue_size gauge`);
      metrics.push(`claude_queue_size ${queueStats.queued || 0}`);

      metrics.push(`# HELP claude_processing_requests Currently processing requests`);
      metrics.push(`# TYPE claude_processing_requests gauge`);
      metrics.push(`claude_processing_requests ${queueStats.processing || 0}`);
    }

    // 数据库指标
    try {
      const [activeUsers, activeSessions] = await Promise.all([
        query('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
        query('SELECT COUNT(*) as count FROM sessions WHERE is_active = true AND expires_at > NOW()')
      ]);

      metrics.push(`# HELP claude_active_users Total active users`);
      metrics.push(`# TYPE claude_active_users gauge`);
      metrics.push(`claude_active_users ${activeUsers.rows[0].count}`);

      metrics.push(`# HELP claude_active_sessions Total active sessions`);
      metrics.push(`# TYPE claude_active_sessions gauge`);
      metrics.push(`claude_active_sessions ${activeSessions.rows[0].count}`);
    } catch (error) {
      console.error('Error collecting database metrics:', error);
    }

    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n') + '\n');

  } catch (error) {
    console.error('Metrics endpoint error:', error);
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error.message
    });
  }
});

export default router;