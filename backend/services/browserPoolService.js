import EventEmitter from 'events';

class BrowserInstance {
  constructor(id) {
    this.id = id;
    this.busy = false;
    this.lastUsed = Date.now();
    this.messageCount = 0;
    this.conversationHistory = [];
    this.health = 'healthy';
    this.createdAt = Date.now();
  }

  acquire() {
    this.busy = true;
    this.lastUsed = Date.now();
  }

  release() {
    this.busy = false;
    this.lastUsed = Date.now();
    this.messageCount++;
  }

  shouldRecycle(maxMessages = 100, maxAge = 3600000) {
    return this.messageCount > maxMessages || 
           (Date.now() - this.createdAt) > maxAge;
  }

  isStale(staleTimeout = 600000) {
    return !this.busy && (Date.now() - this.lastUsed) > staleTimeout;
  }
}

class BrowserPoolService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      minInstances: options.minInstances || 2,
      maxInstances: options.maxInstances || 5,
      maxMessagesPerInstance: options.maxMessagesPerInstance || 100,
      maxInstanceAge: options.maxInstanceAge || 3600000, // 1 hour
      staleTimeout: options.staleTimeout || 600000, // 10 minutes
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      warmupOnStart: options.warmupOnStart !== false,
      ...options
    };

    this.pool = new Map();
    this.waitingQueue = [];
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      poolUtilization: 0,
      recycledInstances: 0
    };

    this.initialized = false;
    this.healthCheckTimer = null;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('Initializing browser pool with options:', this.options);
    
    // Create minimum number of instances
    for (let i = 0; i < this.options.minInstances; i++) {
      await this.createInstance();
    }

    // Start health check timer
    this.startHealthCheck();

    // Warm up instances if configured
    if (this.options.warmupOnStart) {
      await this.warmupInstances();
    }

    this.initialized = true;
    this.emit('initialized', { poolSize: this.pool.size });
  }

  async createInstance() {
    if (this.pool.size >= this.options.maxInstances) {
      throw new Error('Maximum pool size reached');
    }

    const id = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const instance = new BrowserInstance(id);

    try {
      // Here we'll integrate with Playwright MCP to create actual browser
      console.log(`Creating browser instance: ${id}`);
      
      // TODO: Use Playwright MCP to:
      // 1. Open a new browser
      // 2. Navigate to Claude chat
      // 3. Handle authentication if needed
      
      this.pool.set(id, instance);
      this.emit('instanceCreated', { id, poolSize: this.pool.size });
      
      return instance;
    } catch (error) {
      console.error(`Failed to create browser instance: ${error.message}`);
      throw error;
    }
  }

  async acquireInstance(options = {}) {
    this.stats.totalRequests++;
    
    // Find available instance
    let instance = null;
    
    // First, try to find a free healthy instance
    for (const [id, inst] of this.pool) {
      if (!inst.busy && inst.health === 'healthy' && !inst.shouldRecycle()) {
        instance = inst;
        break;
      }
    }

    // If no instance available, try to create a new one
    if (!instance && this.pool.size < this.options.maxInstances) {
      try {
        instance = await this.createInstance();
      } catch (error) {
        console.error('Failed to create new instance:', error);
      }
    }

    // If still no instance, wait for one to become available
    if (!instance) {
      instance = await this.waitForInstance(options.timeout || 30000);
    }

    if (!instance) {
      this.stats.failedRequests++;
      throw new Error('No browser instance available');
    }

    instance.acquire();
    this.updatePoolStats();
    
    return instance;
  }

  async releaseInstance(instanceId) {
    const instance = this.pool.get(instanceId);
    if (!instance) {
      console.warn(`Instance ${instanceId} not found in pool`);
      return;
    }

    instance.release();

    // Check if instance should be recycled
    if (instance.shouldRecycle(this.options.maxMessagesPerInstance, this.options.maxInstanceAge)) {
      await this.recycleInstance(instanceId);
    }

    // Process waiting queue
    this.processWaitingQueue();
    this.updatePoolStats();
  }

  async waitForInstance(timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.waitingQueue.indexOf(callback);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
        }
        resolve(null);
      }, timeout);

      const callback = (instance) => {
        clearTimeout(timer);
        resolve(instance);
      };

      this.waitingQueue.push(callback);
    });
  }

  processWaitingQueue() {
    if (this.waitingQueue.length === 0) return;

    // Find available instance
    for (const [id, instance] of this.pool) {
      if (!instance.busy && instance.health === 'healthy' && !instance.shouldRecycle()) {
        const callback = this.waitingQueue.shift();
        if (callback) {
          instance.acquire();
          callback(instance);
          break;
        }
      }
    }
  }

  async recycleInstance(instanceId) {
    const instance = this.pool.get(instanceId);
    if (!instance) return;

    console.log(`Recycling browser instance: ${instanceId}`);
    this.stats.recycledInstances++;

    try {
      // TODO: Use Playwright MCP to close the browser
      // await this.closeBrowser(instanceId);
      
      this.pool.delete(instanceId);
      this.emit('instanceRecycled', { id: instanceId, poolSize: this.pool.size });

      // Create a new instance if below minimum
      if (this.pool.size < this.options.minInstances) {
        await this.createInstance();
      }
    } catch (error) {
      console.error(`Failed to recycle instance ${instanceId}:`, error);
      instance.health = 'unhealthy';
    }
  }

  async sendMessage(message, options = {}) {
    const startTime = Date.now();
    let instance = null;

    try {
      // Acquire an instance
      instance = await this.acquireInstance(options);
      
      console.log(`Sending message to browser instance: ${instance.id}`);
      
      // TODO: Use Playwright MCP to:
      // 1. Type message in Claude chat
      // 2. Wait for response
      // 3. Extract response text
      
      const response = {
        id: `msg-${Date.now()}`,
        instanceId: instance.id,
        content: `[Browser Pool] Response from instance ${instance.id}`,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };

      // Update conversation history
      instance.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      instance.conversationHistory.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date()
      });

      this.stats.successfulRequests++;
      this.updateAverageResponseTime(response.duration);

      return response;
    } catch (error) {
      this.stats.failedRequests++;
      console.error('Failed to send message:', error);
      throw error;
    } finally {
      if (instance) {
        await this.releaseInstance(instance.id);
      }
    }
  }

  async warmupInstances() {
    console.log('Warming up browser instances...');
    
    const warmupPromises = [];
    for (const [id, instance] of this.pool) {
      if (!instance.busy) {
        warmupPromises.push(this.warmupInstance(instance));
      }
    }

    await Promise.all(warmupPromises);
    console.log('Browser instances warmed up');
  }

  async warmupInstance(instance) {
    try {
      instance.acquire();
      
      // TODO: Use Playwright MCP to:
      // 1. Send a simple test message
      // 2. Verify response
      
      console.log(`Instance ${instance.id} warmed up`);
      instance.health = 'healthy';
    } catch (error) {
      console.error(`Failed to warmup instance ${instance.id}:`, error);
      instance.health = 'unhealthy';
    } finally {
      instance.release();
    }
  }

  startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  async performHealthCheck() {
    console.log('Performing health check on browser pool...');
    
    for (const [id, instance] of this.pool) {
      // Skip busy instances
      if (instance.busy) continue;

      // Check for stale instances
      if (instance.isStale(this.options.staleTimeout)) {
        console.log(`Instance ${id} is stale, recycling...`);
        await this.recycleInstance(id);
        continue;
      }

      // Check instance health
      try {
        // TODO: Use Playwright MCP to check if browser is responsive
        instance.health = 'healthy';
      } catch (error) {
        console.error(`Instance ${id} health check failed:`, error);
        instance.health = 'unhealthy';
        
        // Recycle unhealthy instances
        if (!instance.busy) {
          await this.recycleInstance(id);
        }
      }
    }

    this.updatePoolStats();
    this.emit('healthCheckCompleted', this.getStats());
  }

  updatePoolStats() {
    const busyInstances = Array.from(this.pool.values()).filter(i => i.busy).length;
    this.stats.poolUtilization = this.pool.size > 0 
      ? (busyInstances / this.pool.size) * 100 
      : 0;
  }

  updateAverageResponseTime(duration) {
    const totalRequests = this.stats.successfulRequests;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (totalRequests - 1) + duration) / totalRequests;
  }

  getStats() {
    const instances = Array.from(this.pool.values()).map(instance => ({
      id: instance.id,
      busy: instance.busy,
      health: instance.health,
      messageCount: instance.messageCount,
      lastUsed: instance.lastUsed,
      createdAt: instance.createdAt,
      conversationLength: instance.conversationHistory.length
    }));

    return {
      ...this.stats,
      poolSize: this.pool.size,
      minInstances: this.options.minInstances,
      maxInstances: this.options.maxInstances,
      busyInstances: instances.filter(i => i.busy).length,
      healthyInstances: instances.filter(i => i.health === 'healthy').length,
      instances
    };
  }

  async shutdown() {
    console.log('Shutting down browser pool...');
    
    // Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Close all browser instances
    const closePromises = [];
    for (const [id, instance] of this.pool) {
      closePromises.push(this.recycleInstance(id));
    }

    await Promise.all(closePromises);
    
    this.pool.clear();
    this.waitingQueue = [];
    this.initialized = false;
    
    this.emit('shutdown');
    console.log('Browser pool shut down');
  }
}

// Create singleton instance
const browserPoolService = new BrowserPoolService();

export default browserPoolService;