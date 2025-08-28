import { spawn } from 'child_process';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ClaudeCliInstance {
  constructor(id, options = {}) {
    this.id = id;
    this.process = null;
    this.busy = false;
    this.ready = false;
    this.messageCount = 0;
    this.conversationHistory = [];
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
    this.options = options;
    this.outputBuffer = '';
    this.currentResolve = null;
    this.currentReject = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`Starting Claude CLI instance: ${this.id}`);
      
      // Spawn a new Claude CLI process
      this.process = spawn('claude', [], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true // Hide CMD window on Windows
      });

      let initOutput = '';
      let initTimeout;

      // Handle stdout
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (!this.ready) {
          initOutput += output;
          // Check if Claude is ready (usually shows a prompt)
          if (output.includes('>') || output.includes('Human:') || initOutput.length > 100) {
            this.ready = true;
            clearTimeout(initTimeout);
            console.log(`Claude CLI instance ${this.id} is ready`);
            resolve(this);
          }
        } else {
          // Accumulate output for current message
          this.outputBuffer += output;
          
          // Check if response is complete (Claude shows prompt again)
          if (this.isResponseComplete(output)) {
            this.handleResponseComplete();
          }
        }
      });

      // Handle stderr
      this.process.stderr.on('data', (data) => {
        console.error(`Claude CLI ${this.id} error:`, data.toString());
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        console.log(`Claude CLI instance ${this.id} exited with code ${code}`);
        this.ready = false;
        this.busy = false;
      });

      // Set timeout for initialization
      initTimeout = setTimeout(() => {
        if (!this.ready) {
          // Assume ready if no clear signal after timeout
          this.ready = true;
          console.log(`Claude CLI instance ${this.id} assumed ready after timeout`);
          resolve(this);
        }
      }, 3000);

      // Handle process error
      this.process.on('error', (err) => {
        console.error(`Failed to start Claude CLI instance ${this.id}:`, err);
        reject(err);
      });
    });
  }

  async sendMessage(message) {
    if (!this.ready) {
      throw new Error(`Instance ${this.id} is not ready`);
    }

    if (this.busy) {
      throw new Error(`Instance ${this.id} is busy`);
    }

    return new Promise((resolve, reject) => {
      this.busy = true;
      this.lastUsed = Date.now();
      this.outputBuffer = '';
      this.currentResolve = resolve;
      this.currentReject = reject;

      const startTime = Date.now();
      
      console.log(`Sending message to CLI instance ${this.id}: ${message.substring(0, 50)}...`);
      
      // Send message to Claude CLI
      this.process.stdin.write(message + '\n');
      
      // Set timeout for response
      const timeout = setTimeout(() => {
        this.busy = false;
        this.currentReject = null;
        this.currentResolve = null;
        reject(new Error(`Timeout waiting for response from instance ${this.id}`));
      }, 30000);

      // Store timeout reference for cleanup
      this.currentTimeout = timeout;
    });
  }

  isResponseComplete(output) {
    // Check various indicators that response is complete
    return output.includes('Human:') || 
           output.includes('>') ||
           (this.outputBuffer.length > 0 && output.endsWith('\n\n')) ||
           (this.outputBuffer.length > 0 && output.includes('```') && this.outputBuffer.includes('```'));
  }

  handleResponseComplete() {
    if (this.currentResolve) {
      clearTimeout(this.currentTimeout);
      
      // Clean up the response
      let response = this.outputBuffer.trim();
      
      // Remove prompts if they appear in output
      response = response.replace(/Human:.*$/s, '').trim();
      response = response.replace(/^>+\s*/gm, '').trim();
      
      const endTime = Date.now();
      const duration = endTime - (this.lastUsed || Date.now());
      
      // Create response object
      const responseObj = {
        id: `msg-${Date.now()}-${this.id}`,
        instanceId: this.id,
        content: response,
        timestamp: new Date(),
        duration,
        messageCount: ++this.messageCount
      };

      // Add to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      this.busy = false;
      this.currentResolve(responseObj);
      this.currentResolve = null;
      this.currentReject = null;
      this.outputBuffer = '';
    }
  }

  async terminate() {
    if (this.process) {
      console.log(`Terminating Claude CLI instance: ${this.id}`);
      
      // Try graceful shutdown first
      this.process.stdin.write('exit\n');
      
      // Give it time to exit gracefully
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGTERM');
        }
      }, 1000);
      
      this.ready = false;
      this.busy = false;
    }
  }

  shouldRecycle(maxMessages = 100, maxAge = 3600000) {
    return this.messageCount >= maxMessages || 
           (Date.now() - this.createdAt) > maxAge;
  }

  isStale(staleTimeout = 600000) {
    return !this.busy && (Date.now() - this.lastUsed) > staleTimeout;
  }
}

class ClaudeCliPoolService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      minInstances: options.minInstances || 2,
      maxInstances: options.maxInstances || 5,
      maxMessagesPerInstance: options.maxMessagesPerInstance || 100,
      maxInstanceAge: options.maxInstanceAge || 3600000, // 1 hour
      staleTimeout: options.staleTimeout || 600000, // 10 minutes
      healthCheckInterval: options.healthCheckInterval || 30000,
      ...options
    };

    this.pool = new Map();
    this.waitingQueue = [];
    this.initialized = false;
    this.healthCheckTimer = null;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      poolUtilization: 0,
      recycledInstances: 0
    };
  }

  async initialize() {
    if (this.initialized) return;

    console.log('Initializing Claude CLI pool with options:', this.options);
    
    // Create minimum number of instances
    const createPromises = [];
    for (let i = 0; i < this.options.minInstances; i++) {
      createPromises.push(this.createInstance());
    }
    
    await Promise.all(createPromises);
    
    // Start health check timer
    this.startHealthCheck();
    
    this.initialized = true;
    this.emit('initialized', { poolSize: this.pool.size });
    
    console.log(`Claude CLI pool initialized with ${this.pool.size} instances`);
  }

  async createInstance() {
    if (this.pool.size >= this.options.maxInstances) {
      throw new Error('Maximum pool size reached');
    }

    const id = `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const instance = new ClaudeCliInstance(id, this.options);
    
    try {
      await instance.start();
      this.pool.set(id, instance);
      this.emit('instanceCreated', { id, poolSize: this.pool.size });
      return instance;
    } catch (error) {
      console.error(`Failed to create CLI instance ${id}:`, error);
      throw error;
    }
  }

  async acquireInstance(options = {}) {
    this.stats.totalRequests++;
    
    // Find available instance
    let instance = null;
    
    // First, try to find a free ready instance
    for (const [id, inst] of this.pool) {
      if (!inst.busy && inst.ready && !inst.shouldRecycle(this.options.maxMessagesPerInstance, this.options.maxInstanceAge)) {
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
      throw new Error('No Claude CLI instance available');
    }

    return instance;
  }

  async releaseInstance(instanceId) {
    const instance = this.pool.get(instanceId);
    if (!instance) {
      console.warn(`Instance ${instanceId} not found in pool`);
      return;
    }

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
      if (!instance.busy && instance.ready && !instance.shouldRecycle(this.options.maxMessagesPerInstance, this.options.maxInstanceAge)) {
        const callback = this.waitingQueue.shift();
        if (callback) {
          callback(instance);
          break;
        }
      }
    }
  }

  async recycleInstance(instanceId) {
    const instance = this.pool.get(instanceId);
    if (!instance) return;

    console.log(`Recycling CLI instance: ${instanceId}`);
    this.stats.recycledInstances++;

    try {
      await instance.terminate();
      this.pool.delete(instanceId);
      this.emit('instanceRecycled', { id: instanceId, poolSize: this.pool.size });

      // Create a new instance if below minimum
      if (this.pool.size < this.options.minInstances) {
        await this.createInstance();
      }
    } catch (error) {
      console.error(`Failed to recycle instance ${instanceId}:`, error);
    }
  }

  async sendMessage(message, options = {}) {
    const startTime = Date.now();
    let instance = null;

    try {
      // Acquire an instance
      instance = await this.acquireInstance(options);
      
      // Send message
      const response = await instance.sendMessage(message);
      
      // Update stats
      this.stats.successfulRequests++;
      this.updateAverageResponseTime(response.duration);
      
      // Add message to history
      instance.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
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

  startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  async performHealthCheck() {
    console.log('Performing health check on Claude CLI pool...');
    
    for (const [id, instance] of this.pool) {
      // Skip busy instances
      if (instance.busy) continue;

      // Check for stale instances
      if (instance.isStale(this.options.staleTimeout)) {
        console.log(`Instance ${id} is stale, recycling...`);
        await this.recycleInstance(id);
        continue;
      }

      // Check if process is still alive
      if (instance.process && instance.process.killed) {
        console.log(`Instance ${id} process is dead, recycling...`);
        await this.recycleInstance(id);
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
    if (totalRequests === 0) {
      this.stats.averageResponseTime = 0;
    } else if (totalRequests === 1) {
      this.stats.averageResponseTime = duration;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (totalRequests - 1) + duration) / totalRequests;
    }
  }

  getStats() {
    const instances = Array.from(this.pool.values()).map(instance => ({
      id: instance.id,
      busy: instance.busy,
      ready: instance.ready,
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
      readyInstances: instances.filter(i => i.ready).length,
      instances
    };
  }

  async shutdown() {
    console.log('Shutting down Claude CLI pool...');
    
    // Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Terminate all instances
    const terminatePromises = [];
    for (const [id, instance] of this.pool) {
      terminatePromises.push(instance.terminate());
    }

    await Promise.all(terminatePromises);
    
    this.pool.clear();
    this.waitingQueue = [];
    this.initialized = false;
    
    this.emit('shutdown');
    console.log('Claude CLI pool shut down');
  }
}

// Create singleton instance
const claudeCliPoolService = new ClaudeCliPoolService();

export default claudeCliPoolService;