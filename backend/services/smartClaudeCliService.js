import { spawn } from 'child_process';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Claude CLI Instance - Each session gets its own instance
 */
class ClaudeInstance extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.busy = false;
    this.messageCount = 0;
    this.conversationHistory = [];
    this.lastUsed = Date.now();
    this.createdAt = Date.now();
    this.maxIdleTime = 10 * 60 * 1000; // 10分钟无活动自动回收
    this.maxMessages = 100; // 100条消息后自动回收
    this.timeoutHandle = null;
    this.scheduledForDestroy = false;
    
    console.log(`Created Claude instance for session: ${sessionId}`);
    this.scheduleDestroy();
  }

  scheduleDestroy() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    
    this.timeoutHandle = setTimeout(() => {
      if (!this.busy && !this.scheduledForDestroy) {
        this.scheduledForDestroy = true;
        this.emit('shouldDestroy', this.sessionId);
      }
    }, this.maxIdleTime);
  }

  async sendMessage(message) {
    if (this.busy) {
      throw new Error('Instance is busy');
    }

    if (this.scheduledForDestroy) {
      throw new Error('Instance scheduled for destruction');
    }

    this.busy = true;
    this.lastUsed = Date.now();
    
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    try {
      // 构建完整对话上下文
      let fullMessage = message;
      if (this.conversationHistory.length > 0) {
        const recentHistory = this.conversationHistory
          .slice(-8) // 最近4轮对话
          .map(msg => `${msg.role}: ${msg.content}`)
          .join('\n\n');
        
        fullMessage = `Previous conversation:\n${recentHistory}\n\nHuman: ${message}\n\nAssistant:`;
      }

      const response = await this.executeClaude(fullMessage);
      
      // 保存对话历史
      this.conversationHistory.push(
        { role: 'Human', content: message, timestamp: Date.now() },
        { role: 'Assistant', content: response, timestamp: Date.now() }
      );
      
      this.messageCount++;
      
      if (this.messageCount >= this.maxMessages) {
        this.scheduledForDestroy = true;
        this.emit('shouldDestroy', this.sessionId);
      } else {
        this.scheduleDestroy();
      }
      
      return {
        content: response,
        timestamp: new Date(),
        messageCount: this.messageCount,
        sessionId: this.sessionId
      };
    } finally {
      this.busy = false;
    }
  }

  async executeClaude(message) {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      
      // 使用--print模式，每次都是新的Claude进程，避免session冲突
      const claudeProcess = spawn('claude', ['--print'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const timeout = setTimeout(() => {
        claudeProcess.kill();
        reject(new Error('Claude CLI timeout after 5 minutes'));
      }, 300000);
      
      claudeProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log(`[${this.sessionId}] Claude output:`, chunk.substring(0, 100));
        output += chunk;
      });
      
      claudeProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.log(`[${this.sessionId}] Claude error:`, chunk.substring(0, 100));
        errorOutput += chunk;
      });
      
      claudeProcess.on('close', (code) => {
        clearTimeout(timeout);
        const response = output.trim();
        
        console.log(`[${this.sessionId}] Claude process closed with code ${code}`);
        console.log(`[${this.sessionId}] Output length: ${output.length}`);
        
        if (!response && code !== 0) {
          reject(new Error(`Claude CLI failed with code ${code}: ${errorOutput}`));
        } else if (!response) {
          reject(new Error('Empty response from Claude CLI'));
        } else {
          resolve(response);
        }
      });
      
      claudeProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`[${this.sessionId}] Process error:`, error);
        reject(error);
      });
      
      // 发送消息
      console.log(`[${this.sessionId}] Sending message:`, message.substring(0, 100));
      claudeProcess.stdin.write(message + '\n');
      claudeProcess.stdin.end();
    });
  }

  destroy() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.scheduledForDestroy = true;
    this.removeAllListeners();
    console.log(`Destroyed Claude instance for session: ${this.sessionId}`);
  }

  getStats() {
    return {
      sessionId: this.sessionId,
      busy: this.busy,
      messageCount: this.messageCount,
      lastUsed: this.lastUsed,
      createdAt: this.createdAt,
      scheduledForDestroy: this.scheduledForDestroy,
      idleTime: Date.now() - this.lastUsed,
      conversationLength: this.conversationHistory.length
    };
  }
}

/**
 * Smart Claude CLI Service - 一个session一个instance
 */
class SmartClaudeCliService extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map(); // sessionId -> ClaudeInstance
    this.maxInstances = 20; // 最大20个并发实例
    this.waitingQueue = []; // 等待队列
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      instancesCreated: 0,
      instancesDestroyed: 0,
      averageResponseTime: 0,
      queuedRequests: 0,
      rejectedRequests: 0
    };
    
    console.log(`Smart Claude CLI Service initialized - max ${this.maxInstances} instances`);
  }

  async sendMessage(message, options = {}) {
    const { sessionId } = options;
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    this.stats.totalRequests++;
    const startTime = Date.now();
    
    try {
      const instance = this.getOrCreateInstance(sessionId);
      console.log(`Using Claude instance for session: ${sessionId}`);
      
      const response = await instance.sendMessage(message);
      
      const duration = Date.now() - startTime;
      this.stats.successfulRequests++;
      this.updateAverageResponseTime(duration);
      
      return response;
    } catch (error) {
      this.stats.failedRequests++;
      console.error(`Message processing failed for session ${sessionId}:`, error.message);
      throw error;
    }
  }

  getOrCreateInstance(sessionId) {
    // 检查是否已存在该session的实例
    if (this.instances.has(sessionId)) {
      const instance = this.instances.get(sessionId);
      if (!instance.scheduledForDestroy) {
        return instance;
      } else {
        // 实例即将销毁，先删除再创建新的
        this.destroyInstance(sessionId);
      }
    }
    
    // 创建新实例
    return this.createNewInstance(sessionId);
  }

  createNewInstance(sessionId) {
    // 检查实例数限制
    if (this.instances.size >= this.maxInstances) {
      console.log(`Max instances (${this.maxInstances}) reached, rejecting new session: ${sessionId}`);
      this.stats.rejectedRequests++;
      throw new Error(`Maximum concurrent sessions (${this.maxInstances}) reached. Please try again later.`);
    }
    
    const instance = new ClaudeInstance(sessionId);
    
    // 监听销毁事件
    instance.on('shouldDestroy', (sessionId) => {
      setTimeout(() => this.destroyInstance(sessionId), 1000);
    });
    
    this.instances.set(sessionId, instance);
    this.stats.instancesCreated++;
    
    console.log(`Created new Claude instance for session: ${sessionId} (total: ${this.instances.size}/${this.maxInstances})`);
    
    return instance;
  }

  destroyInstance(sessionId) {
    const instance = this.instances.get(sessionId);
    if (!instance) return;
    
    if (instance.busy) {
      setTimeout(() => this.destroyInstance(sessionId), 2000);
      return;
    }
    
    instance.destroy();
    this.instances.delete(sessionId);
    this.stats.instancesDestroyed++;
    
    console.log(`Destroyed Claude instance for session: ${sessionId} (remaining: ${this.instances.size})`);
  }

  updateAverageResponseTime(duration) {
    const count = this.stats.successfulRequests;
    if (count === 1) {
      this.stats.averageResponseTime = duration;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (count - 1) + duration) / count;
    }
  }

  getStats() {
    const instanceStats = Array.from(this.instances.values()).map(i => i.getStats());
    
    return {
      ...this.stats,
      currentSessions: this.instances.size,
      busyInstances: instanceStats.filter(i => i.busy).length,
      idleInstances: instanceStats.filter(i => !i.busy && !i.scheduledForDestroy).length,
      scheduledForDestroy: instanceStats.filter(i => i.scheduledForDestroy).length,
      sessions: instanceStats
    };
  }

  async healthCheck() {
    const stats = this.getStats();
    return {
      healthy: true,
      timestamp: new Date(),
      service: 'Smart Claude CLI Service',
      ...stats
    };
  }

  async shutdown() {
    console.log('Shutting down Smart Claude CLI Service...');
    
    for (const sessionId of this.instances.keys()) {
      this.destroyInstance(sessionId);
    }
    
    console.log('Smart Claude CLI Service shut down');
  }
}

const smartClaudeCliService = new SmartClaudeCliService();

export default smartClaudeCliService;