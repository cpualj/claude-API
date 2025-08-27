import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { WorkerStatusManager, RequestQueue } from './redis.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkerManager extends EventEmitter {
  constructor(io, redis) {
    super();
    this.io = io;
    this.redis = redis;
    this.workers = new Map();
    this.statusManager = new WorkerStatusManager(redis.redis);
    this.requestQueue = new RequestQueue(redis.redis);
    this.healthCheckInterval = null;
    this.maxWorkers = parseInt(process.env.MAX_WORKERS) || 3;
    this.maxConcurrentPerWorker = parseInt(process.env.MAX_CONCURRENT_PER_WORKER) || 5;
  }

  async initialize() {
    console.log('🚀 Initializing Worker Manager...');
    
    // 启动健康检查
    this.startHealthCheck();
    
    // 启动请求处理器
    this.startRequestProcessor();
    
    // 初始化本地 Workers（如果配置了）
    await this.initializeLocalWorkers();
    
    console.log('✅ Worker Manager initialized');
  }

  async initializeLocalWorkers() {
    const localWorkerCount = parseInt(process.env.LOCAL_WORKERS) || 0;
    
    if (localWorkerCount > 0) {
      console.log(`🚀 Starting ${localWorkerCount} local workers...`);
      
      for (let i = 0; i < localWorkerCount; i++) {
        await this.spawnLocalWorker(`local-worker-${i + 1}`);
      }
    }
  }

  async spawnLocalWorker(workerId) {
    try {
      const workerInfo = {
        id: workerId,
        type: 'local',
        hostname: 'localhost',
        port: 3002 + this.workers.size,
        maxConcurrent: this.maxConcurrentPerWorker,
        status: 'starting'
      };

      // 启动 Worker 进程
      const workerProcess = spawn('node', ['../worker/claude-worker.js'], {
        env: {
          ...process.env,
          WORKER_ID: workerId,
          WORKER_PORT: workerInfo.port,
          MAX_CONCURRENT: this.maxConcurrentPerWorker
        },
        stdio: 'pipe'
      });

      workerProcess.stdout.on('data', (data) => {
        console.log(`[${workerId}] ${data.toString().trim()}`);
      });

      workerProcess.stderr.on('data', (data) => {
        console.error(`[${workerId}] ERROR: ${data.toString().trim()}`);
      });

      workerProcess.on('exit', (code) => {
        console.log(`[${workerId}] Process exited with code ${code}`);
        this.handleWorkerDisconnection(workerId);
      });

      // 注册 Worker
      await this.registerWorker(workerId, {
        ...workerInfo,
        process: workerProcess,
        startedAt: Date.now()
      });

      console.log(`✅ Local worker ${workerId} started on port ${workerInfo.port}`);
      
    } catch (error) {
      console.error(`❌ Failed to spawn local worker ${workerId}:`, error);
    }
  }

  async registerWorker(workerId, info) {
    // 保存到本地状态
    this.workers.set(workerId, {
      ...info,
      currentLoad: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastSeen: Date.now()
    });

    // 保存到 Redis
    await this.statusManager.registerWorker(workerId, info);
    
    // 通知前端
    this.emitWorkersUpdate();
    
    this.emit('worker:registered', { workerId, info });
    console.log(`✅ Worker registered: ${workerId}`);
  }

  async unregisterWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      // 如果是本地进程，终止它
      if (worker.process) {
        worker.process.kill('SIGTERM');
      }
      
      // 从本地状态移除
      this.workers.delete(workerId);
      
      // 从 Redis 移除
      await this.statusManager.removeWorker(workerId);
      
      // 通知前端
      this.emitWorkersUpdate();
      
      this.emit('worker:unregistered', { workerId });
      console.log(`❌ Worker unregistered: ${workerId}`);
    }
  }

  async submitRequest(request) {
    const requestId = uuidv4();
    const requestData = {
      id: requestId,
      ...request,
      submittedAt: Date.now()
    };

    // 尝试直接分配给可用的 Worker
    const worker = await this.getAvailableWorker();
    
    if (worker) {
      return this.processRequest(worker, requestData);
    } else {
      // 没有可用 Worker，加入队列
      await this.requestQueue.enqueue(requestData);
      console.log(`📋 Request ${requestId} queued (no available workers)`);
      
      return {
        requestId,
        status: 'queued',
        message: 'Request queued, will be processed when a worker becomes available'
      };
    }
  }

  async getAvailableWorker() {
    const workers = Array.from(this.workers.values());
    
    // 过滤在线且未满负载的 Workers
    const available = workers.filter(worker => 
      worker.status === 'online' && 
      worker.currentLoad < worker.maxConcurrent
    );

    if (available.length === 0) return null;

    // 选择负载最低的 Worker
    available.sort((a, b) => a.currentLoad - b.currentLoad);
    return available[0];
  }

  async processRequest(worker, request) {
    try {
      // 增加 Worker 负载
      worker.currentLoad++;
      worker.totalRequests++;
      await this.statusManager.updateWorkerStatus(worker.id, worker.status, {
        currentLoad: worker.currentLoad,
        totalRequests: worker.totalRequests
      });

      const startTime = Date.now();
      
      // 这里应该调用实际的 Worker API
      // 现在使用模拟实现
      const result = await this.callWorkerAPI(worker, request);
      
      const responseTime = Date.now() - startTime;
      
      // 更新统计信息
      worker.currentLoad--;
      worker.successfulRequests++;
      worker.averageResponseTime = (
        (worker.averageResponseTime * (worker.successfulRequests - 1) + responseTime) / 
        worker.successfulRequests
      );

      await this.statusManager.updateWorkerStatus(worker.id, worker.status, {
        currentLoad: worker.currentLoad,
        successfulRequests: worker.successfulRequests,
        averageResponseTime: Math.round(worker.averageResponseTime)
      });

      // 完成请求
      await this.requestQueue.complete(request.id, result);
      
      this.emitWorkersUpdate();
      
      return {
        requestId: request.id,
        status: 'completed',
        result,
        responseTime
      };

    } catch (error) {
      console.error(`❌ Request processing failed:`, error);
      
      // 更新错误统计
      worker.currentLoad = Math.max(0, worker.currentLoad - 1);
      worker.failedRequests++;
      
      await this.statusManager.updateWorkerStatus(worker.id, worker.status, {
        currentLoad: worker.currentLoad,
        failedRequests: worker.failedRequests
      });

      // 标记请求失败
      await this.requestQueue.fail(request.id, error);
      
      this.emitWorkersUpdate();
      
      return {
        requestId: request.id,
        status: 'failed',
        error: error.message
      };
    }
  }

  async callWorkerAPI(worker, request) {
    // 这里应该实现实际的 Worker API 调用
    // 现在使用模拟实现
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.1) {
          reject(new Error('Simulated worker error'));
        } else {
          resolve({
            success: true,
            response: `Response from ${worker.id} for: ${request.message}`,
            toolId: request.toolId,
            sessionId: request.sessionId,
            usage: {
              inputTokens: Math.floor(Math.random() * 100),
              outputTokens: Math.floor(Math.random() * 200),
              totalTokens: Math.floor(Math.random() * 300)
            }
          });
        }
      }, 500 + Math.random() * 2000); // 模拟 0.5-2.5 秒响应时间
    });
  }

  startRequestProcessor() {
    // 处理队列中的请求
    const processQueue = async () => {
      try {
        const request = await this.requestQueue.dequeue(5); // 5秒超时
        if (request) {
          const worker = await this.getAvailableWorker();
          if (worker) {
            await this.processRequest(worker, request);
          } else {
            // 重新入队
            await this.requestQueue.enqueue(request);
          }
        }
      } catch (error) {
        console.error('Queue processing error:', error);
      }
      
      // 继续处理
      setImmediate(processQueue);
    };

    processQueue();
    console.log('✅ Request processor started');
  }

  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, 30000); // 每30秒检查一次

    console.log('✅ Health check started');
  }

  async performHealthCheck() {
    const now = Date.now();
    const timeout = 90000; // 90秒超时

    for (const [workerId, worker] of this.workers.entries()) {
      // 检查最后心跳时间
      if (now - worker.lastSeen > timeout) {
        console.log(`⚠️ Worker ${workerId} appears offline, removing...`);
        await this.handleWorkerDisconnection(workerId);
        continue;
      }

      // 发送心跳检查（如果是远程 Worker）
      if (worker.type === 'remote') {
        try {
          await this.pingWorker(worker);
          worker.lastSeen = now;
        } catch (error) {
          console.log(`⚠️ Worker ${workerId} ping failed:`, error.message);
          await this.markWorkerOffline(workerId);
        }
      }
    }

    // 检查 Redis 中离线的 Workers
    const offlineWorkers = await this.statusManager.getOfflineWorkers();
    for (const worker of offlineWorkers) {
      if (this.workers.has(worker.id)) {
        console.log(`⚠️ Worker ${worker.id} offline in Redis, removing locally...`);
        await this.handleWorkerDisconnection(worker.id);
      }
    }
  }

  async pingWorker(worker) {
    // 实现 Worker ping 逻辑
    // 这里应该调用 Worker 的健康检查端点
    return Promise.resolve();
  }

  async markWorkerOffline(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = 'offline';
      await this.statusManager.updateWorkerStatus(workerId, 'offline');
      this.emitWorkersUpdate();
      
      this.emit('worker:offline', { workerId });
    }
  }

  async handleWorkerDisconnection(workerId) {
    console.log(`🔌 Handling worker disconnection: ${workerId}`);
    
    const worker = this.workers.get(workerId);
    if (worker) {
      // 如果 Worker 有正在处理的请求，需要重新入队
      if (worker.currentLoad > 0) {
        console.log(`⚠️ Worker ${workerId} has ${worker.currentLoad} pending requests`);
        // 这里可以实现请求重新分配逻辑
      }
      
      await this.unregisterWorker(workerId);
      
      // 如果是本地 Worker 且启用了自动重启
      if (worker.type === 'local' && process.env.AUTO_RESTART_WORKERS === 'true') {
        console.log(`🔄 Auto-restarting local worker: ${workerId}`);
        setTimeout(() => {
          this.spawnLocalWorker(workerId);
        }, 5000); // 5秒后重启
      }
    }
  }

  async updateWorkerHeartbeat(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastSeen = Date.now();
      await this.statusManager.heartbeat(workerId);
      
      if (worker.status === 'offline') {
        worker.status = 'online';
        await this.statusManager.updateWorkerStatus(workerId, 'online');
        this.emitWorkersUpdate();
      }
    }
  }

  getWorkersStatus() {
    const workers = Array.from(this.workers.entries()).map(([id, worker]) => ({
      id,
      type: worker.type,
      hostname: worker.hostname,
      port: worker.port,
      status: worker.status,
      currentLoad: worker.currentLoad,
      maxConcurrent: worker.maxConcurrent,
      totalRequests: worker.totalRequests,
      successfulRequests: worker.successfulRequests,
      failedRequests: worker.failedRequests,
      averageResponseTime: worker.averageResponseTime,
      lastSeen: worker.lastSeen,
      uptime: Date.now() - (worker.startedAt || worker.lastSeen)
    }));

    return {
      workers,
      totalWorkers: workers.length,
      onlineWorkers: workers.filter(w => w.status === 'online').length,
      totalLoad: workers.reduce((sum, w) => sum + w.currentLoad, 0),
      maxCapacity: workers.reduce((sum, w) => sum + w.maxConcurrent, 0)
    };
  }

  async getQueueStats() {
    return await this.requestQueue.getStats();
  }

  emitWorkersUpdate() {
    const status = this.getWorkersStatus();
    this.io.to('workers-status').emit('workers-update', status);
  }

  async shutdown() {
    console.log('🛑 Shutting down Worker Manager...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 优雅关闭所有本地 Workers
    const localWorkers = Array.from(this.workers.values()).filter(w => w.process);
    
    await Promise.all(
      localWorkers.map(async (worker) => {
        if (worker.process) {
          worker.process.kill('SIGTERM');
          
          // 等待进程退出
          return new Promise((resolve) => {
            worker.process.on('exit', resolve);
            setTimeout(resolve, 5000); // 5秒强制超时
          });
        }
      })
    );

    console.log('✅ Worker Manager shutdown complete');
  }
}