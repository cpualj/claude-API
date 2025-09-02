import { spawn } from 'child_process';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Smart Claude CLI Instance
 * 按需创建，智能回收的Claude CLI实例
 */
class SmartClaudeInstance extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.busy = false;
    this.messageCount = 0;
    this.conversationHistory = [];
    this.lastUsed = Date.now();
    this.createdAt = Date.now();
    this.maxIdleTime = 5 * 60 * 1000; // 5分钟无活动自动回收
    this.maxMessages = 50; // 50条消息后自动回收
    this.timeoutHandle = null;
    this.scheduledForDestroy = false;
    
    this.scheduleDestroy();
  }

  scheduleDestroy() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    
    this.timeoutHandle = setTimeout(() => {
      if (!this.busy && !this.scheduledForDestroy) {
        this.scheduledForDestroy = true;
        this.emit('shouldDestroy', this.id);
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
    
    // 清除销毁计时器
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    try {
      // 构建对话上下文
      let fullMessage = message;
      if (this.conversationHistory.length > 0) {
        const recentHistory = this.conversationHistory
          .slice(-4) // 最近2轮对话
          .map(msg => `${msg.role}: ${msg.content}`)
          .join('\n\n');
        
        fullMessage = `Previous context:\n${recentHistory}\n\nCurrent request:\n${message}`;
      }

      const response = await this.executeClaude(fullMessage);
      
      // 保存对话历史
      this.conversationHistory.push(
        { role: 'Human', content: message, timestamp: Date.now() },
        { role: 'Assistant', content: response, timestamp: Date.now() }
      );
      
      this.messageCount++;
      
      // 如果达到最大消息数，标记为需要销毁
      if (this.messageCount >= this.maxMessages) {
        this.scheduledForDestroy = true;
        this.emit('shouldDestroy', this.id);
      } else {
        // 重新调度销毁计时器
        this.scheduleDestroy();
      }
      
      return {
        id: `msg-${Date.now()}-${this.id}`,
        instanceId: this.id,
        content: response,
        timestamp: new Date(),
        messageCount: this.messageCount
      };
    } finally {
      this.busy = false;
    }
  }

  async executeClaude(message) {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      
      const claudeProcess = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
        shell: true,
        timeout: 120000 // 2分钟超时
      });
      
      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      claudeProcess.on('close', (code) => {
        const response = output.trim();
        
        if (!response && code !== 0) {
          reject(new Error(`Claude CLI failed: ${errorOutput}`));
        } else if (!response) {
          reject(new Error('Empty response from Claude CLI'));
        } else {
          resolve(response);
        }
      });
      
      claudeProcess.on('error', (error) => {
        reject(error);
      });
      
      claudeProcess.stdin.write(message);
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
  }

  getStats() {
    return {
      id: this.id,
      busy: this.busy,
      messageCount: this.messageCount,
      lastUsed: this.lastUsed,
      createdAt: this.createdAt,
      scheduledForDestroy: this.scheduledForDestroy,
      idleTime: Date.now() - this.lastUsed
    };
  }
}

/**
 * Smart Claude CLI Service
 * 完全按需创建和智能回收Claude实例的服务
 */
class SmartClaudeCliService extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map(); // instanceId -> SmartClaudeInstance
    this.sessions = new Map();   // sessionId -> instanceId
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      instancesCreated: 0,
      instancesDestroyed: 0,
      averageResponseTime: 0
    };
    
    // 不需要预初始化，完全按需创建
    console.log('Smart Claude CLI Service initialized - zero pre-allocation mode');
  }

  async sendMessage(message, options = {}) {
    const { sessionId } = options;
    this.stats.totalRequests++;
    
    const startTime = Date.now();
    
    try {
      const instance = await this.getOrCreateInstance(sessionId);
      console.log(`Using instance ${instance.id} for request`);
      
      const response = await instance.sendMessage(message);
      
      const duration = Date.now() - startTime;
      this.stats.successfulRequests++;
      this.updateAverageResponseTime(duration);
      
      return {
        ...response,
        sessionId: sessionId || 'default'
      };
    } catch (error) {
      this.stats.failedRequests++;
      console.error('Message processing failed:', error.message);
      throw error;
    }
  }

  async getOrCreateInstance(sessionId) {
    // 如果有会话ID，尝试复用现有实例
    if (sessionId && this.sessions.has(sessionId)) {
      const instanceId = this.sessions.get(sessionId);
      const instance = this.instances.get(instanceId);
      
      if (instance && !instance.busy && !instance.scheduledForDestroy) {
        return instance;
      } else {
        // 实例不可用，删除会话映射
        this.sessions.delete(sessionId);
        if (instance) {
          this.destroyInstance(instanceId);
        }
      }
    }
    
    // 寻找空闲实例
    for (const [id, instance] of this.instances) {
      if (!instance.busy && !instance.scheduledForDestroy) {
        if (sessionId) {
          this.sessions.set(sessionId, id);
        }
        return instance;
      }
    }
    
    // 没有可用实例，创建新的
    return await this.createNewInstance(sessionId);
  }

  async createNewInstance(sessionId) {
    const instanceId = `claude-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const instance = new SmartClaudeInstance(instanceId);
    
    // 监听销毁事件
    instance.on('shouldDestroy', (id) => {
      setTimeout(() => this.destroyInstance(id), 1000); // 延迟1秒销毁
    });
    
    this.instances.set(instanceId, instance);
    this.stats.instancesCreated++;
    
    if (sessionId) {
      this.sessions.set(sessionId, instanceId);
    }
    
    console.log(`Created new Claude instance: ${instanceId} (total: ${this.instances.size})`);
    
    return instance;
  }

  destroyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    if (instance.busy) {
      // 如果实例忙碌，延迟销毁
      setTimeout(() => this.destroyInstance(instanceId), 2000);
      return;
    }
    
    instance.destroy();
    this.instances.delete(instanceId);
    this.stats.instancesDestroyed++;
    
    // 清理会话映射
    for (const [sessionId, mappedInstanceId] of this.sessions) {
      if (mappedInstanceId === instanceId) {
        this.sessions.delete(sessionId);
      }
    }
    
    console.log(`Destroyed Claude instance: ${instanceId} (remaining: ${this.instances.size})`);
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
      currentInstances: this.instances.size,
      activeSessions: this.sessions.size,
      busyInstances: instanceStats.filter(i => i.busy).length,
      idleInstances: instanceStats.filter(i => !i.busy && !i.scheduledForDestroy).length,
      scheduledForDestroy: instanceStats.filter(i => i.scheduledForDestroy).length,
      instances: instanceStats,
      memory: {
        totalConversations: instanceStats.reduce((sum, i) => sum + i.messageCount, 0),
        averageIdleTime: instanceStats.length > 0 ? 
          instanceStats.reduce((sum, i) => sum + i.idleTime, 0) / instanceStats.length : 0
      }
    };
  }

  getInstanceInfo(instanceId) {
    const instance = this.instances.get(instanceId);
    return instance ? instance.getStats() : null;
  }

  async healthCheck() {
    const stats = this.getStats();
    return {
      healthy: true,
      timestamp: new Date(),
      ...stats
    };
  }

  async shutdown() {
    console.log('Shutting down Smart Claude CLI Service...');
    
    // 销毁所有实例
    for (const instanceId of this.instances.keys()) {
      this.destroyInstance(instanceId);
    }
    
    this.sessions.clear();
    
    console.log('Smart Claude CLI Service shut down');
  }

  // 手动清理空闲实例（可选的维护方法）
  async cleanup() {
    let cleaned = 0;
    
    for (const [id, instance] of this.instances) {
      if (!instance.busy && Date.now() - instance.lastUsed > 10 * 60 * 1000) { // 10分钟无活动
        this.destroyInstance(id);
        cleaned++;
      }
    }
    
    console.log(`Manual cleanup: destroyed ${cleaned} idle instances`);
    return cleaned;
  }
}

// 创建单例
const smartClaudeCliService = new SmartClaudeCliService();

export default smartClaudeCliService;