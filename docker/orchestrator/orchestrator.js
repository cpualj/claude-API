import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import Bull from 'bull';
import axios from 'axios';
import { EventEmitter } from 'events';

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
    
    // Start health checks
    this.startHealthChecks();
  }

  async startHealthChecks() {
    setInterval(async () => {
      for (const worker of this.workers) {
        try {
          const response = await axios.get(`${worker.url}/health`, {
            timeout: 5000
          });
          
          const stats = this.workerStats.get(worker.id);
          stats.healthy = response.data.status === 'healthy';
          stats.currentLoad = response.data.worker?.busy ? 1 : 0;
          
          this.emit('health-check', {
            workerId: worker.id,
            healthy: stats.healthy,
            stats: response.data.worker?.stats
          });
        } catch (error) {
          const stats = this.workerStats.get(worker.id);
          stats.healthy = false;
          stats.errors++;
          
          this.emit('health-check-error', {
            workerId: worker.id,
            error: error.message
          });
        }
      }
    }, 10000); // Check every 10 seconds
  }

  getNextWorker(strategy = 'round-robin') {
    const healthyWorkers = this.workers.filter(w => {
      const stats = this.workerStats.get(w.id);
      return stats.healthy && stats.currentLoad === 0;
    });

    if (healthyWorkers.length === 0) {
      // All workers are busy or unhealthy
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

// Initialize services
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
  }
});

// Parse worker configuration from environment
const workers = JSON.parse(process.env.WORKERS || '[]');
const rateLimits = JSON.parse(process.env.RATE_LIMITS || '{}');

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL);
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = new Redis(process.env.REDIS_URL);

// Initialize Bull Queue
const requestQueue = new Bull('claude-requests', process.env.REDIS_URL);

// Initialize Load Balancer
const loadBalancer = new LoadBalancer(workers);

// Middleware
app.use(cors());
app.use(express.json());

// Request queue processor
requestQueue.process(10, async (job) => {
  const { message, sessionId, userId, options } = job.data;
  
  try {
    // Get next available worker
    const worker = loadBalancer.getNextWorker(options.strategy || 'least-connections');
    
    if (!worker) {
      throw new Error('No available workers');
    }
    
    // Update load
    const stats = loadBalancer.workerStats.get(worker.id);
    stats.currentLoad++;
    
    // Send request to worker
    const startTime = Date.now();
    const response = await axios.post(`${worker.url}/process`, {
      message,
      options
    }, {
      timeout: 120000 // 2 minute timeout
    });
    
    const responseTime = Date.now() - startTime;
    loadBalancer.updateWorkerStats(worker.id, responseTime, true);
    
    // Store in Redis for session history
    await redis.lpush(`session:${sessionId}`, JSON.stringify({
      role: 'user',
      content: message,
      timestamp: new Date()
    }));
    
    await redis.lpush(`session:${sessionId}`, JSON.stringify({
      role: 'assistant',
      content: response.data.content,
      timestamp: new Date(),
      workerId: worker.id
    }));
    
    return {
      ...response.data,
      workerId: worker.id,
      responseTime
    };
  } catch (error) {
    if (error.response?.status === 503) {
      // Worker busy, requeue
      throw new Error('Worker busy, will retry');
    }
    throw error;
  }
});

// Queue event handlers
requestQueue.on('completed', (job, result) => {
  io.to(job.data.sessionId).emit('response', {
    requestId: job.id,
    ...result
  });
});

requestQueue.on('failed', (job, err) => {
  io.to(job.data.sessionId).emit('error', {
    requestId: job.id,
    error: err.message
  });
});

requestQueue.on('progress', (job, progress) => {
  io.to(job.data.sessionId).emit('progress', {
    requestId: job.id,
    progress
  });
});

// Routes
app.get('/health', async (req, res) => {
  const [waiting, active, completed, failed] = await Promise.all([
    requestQueue.getWaitingCount(),
    requestQueue.getActiveCount(),
    requestQueue.getCompletedCount(),
    requestQueue.getFailedCount()
  ]);
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queue: {
      waiting,
      active,
      completed,
      failed
    },
    workers: loadBalancer.getStats(),
    redis: redis.status === 'ready'
  });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message, sessionId = `session-${Date.now()}`, options = {} } = req.body;
  const userId = req.headers['x-user-id'] || 'anonymous';
  
  try {
    // Check rate limits
    const userKey = `rate:${userId}`;
    const userRequests = await redis.incr(userKey);
    
    if (userRequests === 1) {
      await redis.expire(userKey, 3600); // 1 hour window
    }
    
    const limit = rateLimits[userId] || { requests: 50, window: '1h' };
    if (userRequests > limit.requests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: limit.requests,
        window: limit.window
      });
    }
    
    // Add to queue
    const job = await requestQueue.add({
      message,
      sessionId,
      userId,
      options
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 100,
      removeOnFail: 50
    });
    
    // Return job info immediately
    res.json({
      requestId: job.id,
      status: 'queued',
      position: await job.getPosition(),
      estimatedWait: await requestQueue.getWaitingCount() * 5 // 5 seconds per request estimate
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
});

// Get queue status
app.get('/api/queue/status', async (req, res) => {
  const [waiting, active, completed, failed] = await Promise.all([
    requestQueue.getWaitingCount(),
    requestQueue.getActiveCount(),
    requestQueue.getCompletedCount(),
    requestQueue.getFailedCount()
  ]);
  
  res.json({
    waiting,
    active,
    completed,
    failed,
    workers: loadBalancer.getStats()
  });
});

// Get job status
app.get('/api/job/:id', async (req, res) => {
  const job = await requestQueue.getJob(req.params.id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    id: job.id,
    status: await job.getState(),
    progress: job.progress(),
    result: job.returnvalue,
    failedReason: job.failedReason
  });
});

// Session history
app.get('/api/sessions/:id', async (req, res) => {
  const messages = await redis.lrange(`session:${req.params.id}`, 0, -1);
  
  res.json({
    sessionId: req.params.id,
    messages: messages.map(m => JSON.parse(m))
  });
});

// Worker statistics
app.get('/api/workers', (req, res) => {
  res.json({
    workers: workers.map(w => ({
      ...w,
      stats: loadBalancer.workerStats.get(w.id)
    }))
  });
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined session ${sessionId}`);
  });
  
  socket.on('leave-session', (sessionId) => {
    socket.leave(sessionId);
  });
  
  // Send periodic updates
  const interval = setInterval(() => {
    socket.emit('workers-status', loadBalancer.getStats());
  }, 5000);
  
  socket.on('disconnect', () => {
    clearInterval(interval);
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`
🎯 Claude Orchestrator Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Port: ${PORT}
🤖 Workers: ${workers.length}
📊 Load Balancing: Least Connections
🔄 Health Checks: Every 10s
💾 Redis: ${redis.status}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workers:
${workers.map(w => `  • ${w.id}: ${w.url}`).join('\n')}
  `);
});