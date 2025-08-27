import { spawn } from 'child_process';
import EventEmitter from 'events';

class ClaudeWorker {
  constructor(id) {
    this.id = id;
    this.busy = false;
    this.currentJob = null;
    this.createdAt = new Date();
    this.processedCount = 0;
  }

  async process(message, options = {}) {
    if (this.busy) {
      throw new Error(`Worker ${this.id} is busy`);
    }

    this.busy = true;
    this.currentJob = { message, startTime: Date.now() };
    
    try {
      const result = await this.callClaude(message, options);
      this.processedCount++;
      return result;
    } finally {
      this.busy = false;
      this.currentJob = null;
    }
  }

  async callClaude(message, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['--print'];
      
      // 添加模型选择
      if (options.model) {
        args.push('--model', options.model);
      }
      
      args.push(message);

      const claudeProcess = spawn('claude', args, {
        shell: true,
        env: { ...process.env }
      });

      let output = '';
      let error = '';

      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            content: output.trim(),
            workerId: this.id,
            duration: Date.now() - this.currentJob.startTime
          });
        } else {
          reject(new Error(`Worker ${this.id} failed: ${error}`));
        }
      });

      claudeProcess.on('error', (err) => {
        reject(err);
      });
    });
  }

  getStatus() {
    return {
      id: this.id,
      busy: this.busy,
      processedCount: this.processedCount,
      uptime: Date.now() - this.createdAt.getTime(),
      currentJob: this.currentJob
    };
  }
}

class ClaudePoolService extends EventEmitter {
  constructor(poolSize = 3) {
    super();
    this.poolSize = poolSize;
    this.workers = [];
    this.queue = [];
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0
    };
    
    this.initializePool();
  }

  initializePool() {
    console.log(`🏊 Initializing Claude worker pool with ${this.poolSize} workers...`);
    
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new ClaudeWorker(`worker-${i + 1}`);
      this.workers.push(worker);
      console.log(`✅ Worker ${worker.id} ready`);
    }
    
    this.emit('pool-ready', { size: this.poolSize });
  }

  async chat(message, options = {}) {
    this.stats.totalRequests++;
    
    // 尝试找一个空闲的 worker
    const availableWorker = this.workers.find(w => !w.busy);
    
    if (availableWorker) {
      // 有空闲 worker，直接处理
      this.emit('processing', { 
        workerId: availableWorker.id,
        message: message.substring(0, 50) 
      });
      
      try {
        const startTime = Date.now();
        const result = await availableWorker.process(message, options);
        
        // 更新统计
        const responseTime = Date.now() - startTime;
        this.updateStats(responseTime, true);
        
        this.emit('completed', {
          workerId: availableWorker.id,
          duration: responseTime
        });
        
        // 处理完后检查队列
        this.processQueue();
        
        return result;
      } catch (error) {
        this.stats.failedRequests++;
        this.emit('error', { 
          workerId: availableWorker.id, 
          error: error.message 
        });
        throw error;
      }
    } else {
      // 所有 worker 都忙，加入队列
      return this.addToQueue(message, options);
    }
  }

  addToQueue(message, options) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        id: `queue-${Date.now()}-${Math.random()}`,
        message,
        options,
        resolve,
        reject,
        timestamp: new Date()
      };
      
      this.queue.push(queueItem);
      
      this.emit('queued', {
        id: queueItem.id,
        position: this.queue.length,
        estimatedWait: this.estimateWaitTime()
      });
    });
  }

  async processQueue() {
    if (this.queue.length === 0) return;
    
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;
    
    const queueItem = this.queue.shift();
    
    try {
      const result = await availableWorker.process(
        queueItem.message, 
        queueItem.options
      );
      
      queueItem.resolve(result);
      
      // 继续处理队列
      setTimeout(() => this.processQueue(), 100);
    } catch (error) {
      queueItem.reject(error);
      setTimeout(() => this.processQueue(), 100);
    }
  }

  updateStats(responseTime, success) {
    if (success) {
      this.stats.completedRequests++;
      // 计算移动平均
      const n = this.stats.completedRequests;
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (n - 1) + responseTime) / n;
    } else {
      this.stats.failedRequests++;
    }
  }

  estimateWaitTime() {
    // 基于平均响应时间估算等待时间
    const busyWorkers = this.workers.filter(w => w.busy).length;
    const avgTime = this.stats.averageResponseTime || 5000; // 默认5秒
    
    // 队列中的位置 * 平均时间 / worker 数量
    return Math.ceil((this.queue.length * avgTime) / this.poolSize);
  }

  getPoolStatus() {
    return {
      workers: this.workers.map(w => w.getStatus()),
      queueLength: this.queue.length,
      stats: this.stats,
      poolHealth: this.getPoolHealth()
    };
  }

  getPoolHealth() {
    const busyWorkers = this.workers.filter(w => w.busy).length;
    const utilizationRate = busyWorkers / this.poolSize;
    
    if (utilizationRate < 0.5) return 'healthy';
    if (utilizationRate < 0.8) return 'moderate';
    return 'busy';
  }

  // 动态调整池大小
  async scalePool(newSize) {
    if (newSize > this.poolSize) {
      // 扩容
      for (let i = this.poolSize; i < newSize; i++) {
        const worker = new ClaudeWorker(`worker-${i + 1}`);
        this.workers.push(worker);
        console.log(`➕ Added worker ${worker.id}`);
      }
    } else if (newSize < this.poolSize) {
      // 缩容 - 等待 worker 完成当前任务后移除
      const toRemove = this.poolSize - newSize;
      for (let i = 0; i < toRemove; i++) {
        const worker = this.workers.pop();
        if (worker.busy) {
          // 等待完成当前任务
          console.log(`⏳ Waiting for worker ${worker.id} to finish...`);
        }
      }
    }
    
    this.poolSize = newSize;
    this.emit('pool-scaled', { newSize });
  }

  // 获取最佳 worker（负载均衡）
  getBestWorker() {
    // 选择处理任务最少的 worker
    return this.workers
      .filter(w => !w.busy)
      .sort((a, b) => a.processedCount - b.processedCount)[0];
  }
}

// 创建默认实例（3个 worker）
const claudePoolService = new ClaudePoolService(3);

export default claudePoolService;