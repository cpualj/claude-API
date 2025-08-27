import EventEmitter from 'events';
import { spawn } from 'child_process';

class ClaudeQueueService extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.currentProcess = null;
  }

  // 添加请求到队列
  async addToQueue(message, context = [], options = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        id: `req-${Date.now()}-${Math.random()}`,
        message,
        context,
        options,
        resolve,
        reject,
        timestamp: new Date(),
        status: 'queued'
      };

      this.queue.push(request);
      this.emit('queued', { 
        id: request.id, 
        position: this.queue.length,
        queueSize: this.queue.length 
      });

      // 开始处理队列
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const request = this.queue.shift();
    
    this.emit('processing', { 
      id: request.id,
      remainingInQueue: this.queue.length 
    });

    try {
      // 使用 --print 模式调用 Claude CLI（非交互式）
      const result = await this.callClaude(request.message, request.options);
      request.resolve(result);
      
      this.emit('completed', { 
        id: request.id,
        duration: Date.now() - request.timestamp.getTime()
      });
    } catch (error) {
      request.reject(error);
      this.emit('error', { id: request.id, error: error.message });
    } finally {
      this.isProcessing = false;
      // 继续处理下一个
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async callClaude(message, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['--print', message];
      
      const claudeProcess = spawn('claude', args, {
        shell: true,
        env: { ...process.env }
      });

      let output = '';
      let error = '';

      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (options.stream) {
          this.emit('stream', { chunk: data.toString() });
        }
      });

      claudeProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            content: output.trim(),
            usage: this.estimateUsage(message, output),
            timestamp: new Date()
          });
        } else {
          reject(new Error(`Claude process exited with code ${code}: ${error}`));
        }
      });

      claudeProcess.on('error', (err) => {
        reject(err);
      });

      // Store current process for potential cancellation
      this.currentProcess = claudeProcess;
    });
  }

  // 获取队列状态
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      requests: this.queue.map((req, index) => ({
        id: req.id,
        position: index + 1,
        timestamp: req.timestamp,
        waitTime: Date.now() - req.timestamp.getTime()
      }))
    };
  }

  // 取消特定请求
  cancelRequest(requestId) {
    const index = this.queue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      request.reject(new Error('Request cancelled by user'));
      this.emit('cancelled', { id: requestId });
      return true;
    }
    return false;
  }

  // 估算 token 使用量
  estimateUsage(input, output) {
    return {
      inputTokens: Math.ceil(input.length / 4),
      outputTokens: Math.ceil(output.length / 4),
      totalTokens: Math.ceil((input.length + output.length) / 4)
    };
  }

  // 清空队列
  clearQueue() {
    const count = this.queue.length;
    this.queue.forEach(req => {
      req.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    this.emit('queue-cleared', { count });
  }
}

// 创建单例
const claudeQueueService = new ClaudeQueueService();

export default claudeQueueService;